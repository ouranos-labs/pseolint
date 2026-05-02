import { and, eq, ne } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { orchestratorSessions, fixManifests, userAiKeys, users } from "@/db/schema";
import { uploadSummary } from "@/lib/r2";
import { auditLog } from "@/lib/audit-log";
import { openSecret } from "@/lib/secret-box";
import { publicSlug } from "@/lib/slug";
import { sendOrchestratorCompleteEmail } from "@/lib/resend";
import { env } from "@/lib/env";
import { orchestrate, type SessionEvent } from "@pseolint/core";

/**
 * Manifest retention by tier — mirrors the audit retention pattern.
 *   Free: 30 days
 *   Pro:  90 days (matches monitoring retention)
 */
const MANIFEST_RETENTION_DAYS_FREE = 30;
const MANIFEST_RETENTION_DAYS_PRO = 90;

/**
 * Run an orchestrator session that's already been queued in the DB. Loads
 * the user's BYOK key (if any), invokes `orchestrate()` from `@pseolint/core`,
 * persists the durable NDJSON log + final manifest+validation+diff payload
 * to R2, and writes terminal stats back to the session row.
 *
 * Event streaming for live UI is Phase 5 batch 2 — this batch persists the
 * full log at the end of the run. The web app's SSE endpoint can either:
 *   (a) tail the R2 NDJSON object once the session completes, or
 *   (b) be wired to a sidechannel (Redis / Inngest realtime) for live tailing.
 */
export const runOrchestratorSession = inngest.createFunction(
  {
    id: "run-orchestrator-session",
    /**
     * No automatic retries. Each orchestrator session burns $1-3 in real
     * money; an Inngest function-level retry would re-run the whole
     * step.run("orchestrate", ...) and double-bill. Transient model
     * errors are handled inside `orchestrate()` via the AI SDK's per-call
     * `maxRetries: 5` with backoff — that's the right layer for retries.
     * Function-level failure should surface to the user as `failed`
     * status, not silently re-charge them.
     */
    retries: 0,
    /**
     * User-initiated cancellation. The DELETE /api/orchestrate/[id]
     * endpoint dispatches `orchestrator/cancel-requested`; Inngest matches
     * on `data.sessionId` and aborts this function. The race-safe
     * mark-terminal step (`ne(status, "aborted")`) ensures we don't
     * un-cancel a user's intent if the function happens to finish a step
     * after the cancel event.
     */
    cancelOn: [
      {
        event: "orchestrator/cancel-requested",
        match: "data.sessionId",
      },
    ],
  },
  { event: "orchestrator/requested" },
  async ({ event, step }) => {
    const { sessionId } = event.data;
    const startedAt = Date.now();

    auditLog("orchestrator.started", { sessionId });

    const sessionRow = await step.run("load-session", async () => {
      const [row] = await db
        .select()
        .from(orchestratorSessions)
        .where(eq(orchestratorSessions.id, sessionId))
        .limit(1);
      if (!row) throw new Error(`orchestrator session ${sessionId} not found`);
      return row;
    });

    await step.run("mark-running", async () => {
      await db
        .update(orchestratorSessions)
        .set({ status: "running" })
        .where(eq(orchestratorSessions.id, sessionId));
    });

    const aiKey = await step.run("load-byok-key", async () => {
      const [row] = await db
        .select({ provider: userAiKeys.provider, model: userAiKeys.model, apiKey: userAiKeys.apiKey })
        .from(userAiKeys)
        .where(eq(userAiKeys.userId, sessionRow.userId))
        .limit(1);
      if (!row) return null;
      return {
        provider: row.provider,
        model: row.model,
        apiKey: openSecret(row.apiKey),
      };
    });

    // Buffer events in-memory; persist as NDJSON to R2 once the session
    // terminates. Live tailing is Phase 5 batch 2.
    const events: SessionEvent[] = [];
    const onEvent = (e: SessionEvent) => {
      events.push(e);
    };

    const result = await step.run("orchestrate", async () => {
      const r = await orchestrate({
        domain: sessionRow.domain,
        userId: sessionRow.userId,
        ai: aiKey
          ? { provider: aiKey.provider, model: aiKey.model ?? undefined, apiKey: aiKey.apiKey }
          : undefined,
        budget: {
          maxSessionUsd: Number(sessionRow.budgetUsd),
        },
        onEvent,
      });
      // Strip the events array from the persisted result — events are
      // streamed separately to the NDJSON log to avoid duplication.
      return {
        sessionResult: {
          sessionId: r.session.sessionId,
          domain: r.session.domain,
          reason: r.session.reason,
          usage: r.session.usage,
          error: r.session.error,
        },
        manifest: r.manifest,
        validation: r.validation,
        diff: r.diff,
      };
    });

    const logKey = `orchestrator/${sessionId}/log.ndjson`;
    await step.run("persist-event-log", async () => {
      const ndjson = events.map((e) => JSON.stringify(e)).join("\n");
      await uploadSummary(logKey, ndjson || "");
    });

    let manifestSlug: string | null = null;
    let manifestKey: string | null = null;
    if (result.manifest && result.validation && result.diff) {
      manifestKey = `orchestrator/${sessionId}/manifest.json`;
      manifestSlug = publicSlug();
      const manifest = result.manifest;
      const validation = result.validation;
      const diff = result.diff;
      await step.run("persist-manifest", async () => {
        await uploadSummary(
          manifestKey!,
          JSON.stringify({ manifest, validation, diff }, null, 2),
        );
      });

      const retentionDays = aiKey ? MANIFEST_RETENTION_DAYS_PRO : MANIFEST_RETENTION_DAYS_FREE;
      const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000);

      await step.run("insert-manifest-row", async () => {
        await db.insert(fixManifests).values({
          sessionId,
          slug: manifestSlug!,
          schemaVersion: "2026-05-v0.4.4",
          domain: manifest.domain,
          verdict: manifest.verdict,
          pagePatchCount: manifest.pages.length,
          templatePatchCount: manifest.templates.length,
          domainPatchCount: manifest.domainLevel.length,
          validPatchCount: validation.validPatches,
          totalPatchCount: validation.totalPatches,
          manifestKey: manifestKey!,
          isPublic: false, // owner-private by default; share via explicit toggle
          expiresAt,
        });
      });
    }

    const terminalStatus =
      result.sessionResult.reason === "completed"
        ? "completed"
        : result.sessionResult.reason === "aborted"
          ? "aborted"
          : "failed";

    await step.run("mark-terminal", async () => {
      // Race-safe terminal write: if the user cancelled mid-flight (DELETE
      // /api/orchestrate/[id] flipped status to "aborted"), the WHERE
      // clause `ne(status, "aborted")` skips the update so we don't
      // overwrite the user's intent. The orchestrator's own usage stats
      // would be lost in that case, but losing $0.50 of analytics is the
      // right trade vs silently un-cancelling a user request.
      await db
        .update(orchestratorSessions)
        .set({
          status: terminalStatus,
          reason: result.sessionResult.reason,
          spentUsd: String(result.sessionResult.usage.estimatedUsd.toFixed(4)),
          inputTokens: result.sessionResult.usage.inputTokens,
          outputTokens: result.sessionResult.usage.outputTokens,
          toolCallCount: result.sessionResult.usage.toolCallCount,
          durationMs: result.sessionResult.usage.elapsedMs,
          modelId: aiKey?.model ?? null,
          providerId: aiKey?.provider ?? null,
          logKey,
          errorMessage: result.sessionResult.error ?? null,
          completedAt: new Date(),
        })
        .where(
          and(eq(orchestratorSessions.id, sessionId), ne(orchestratorSessions.status, "aborted")),
        );
    });

    auditLog("orchestrator.completed", {
      sessionId,
      reason: result.sessionResult.reason,
      ms: Date.now() - startedAt,
      toolCallCount: result.sessionResult.usage.toolCallCount,
      spentUsd: result.sessionResult.usage.estimatedUsd,
    });

    // Email notification on terminal status (success OR failure — both warrant
    // an inbox ping since the user paid for the run). User-cancelled
    // sessions skip the email since the user already knows. Best-effort —
    // delivery failures don't roll back the session.
    const wantsEmail =
      (result.sessionResult.reason === "completed" || terminalStatus === "failed") &&
      result.sessionResult.reason !== "aborted";
    if (wantsEmail) {
      await step.run("notify-user", async () => {
        const [userRow] = await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, sessionRow.userId))
          .limit(1);
        if (!userRow?.email) return;

        const baseUrl = env().BETTER_AUTH_URL.replace(/\/$/, "");
        // For success: link to the manifest. For failure: link to the
        // session-progress page so the user can see what went wrong.
        const followUpUrl =
          manifestSlug && result.manifest
            ? `${baseUrl}/m/${manifestSlug}`
            : `${baseUrl}/o/${sessionId}`;

        await sendOrchestratorCompleteEmail(userRow.email, {
          domain: sessionRow.domain,
          verdict: result.manifest?.verdict ?? "concerning",
          manifestUrl: followUpUrl,
          pagePatchCount: result.manifest?.pages.length ?? 0,
          templatePatchCount: result.manifest?.templates.length ?? 0,
          domainPatchCount: result.manifest?.domainLevel.length ?? 0,
          validPatchCount: result.validation?.validPatches ?? 0,
          totalPatchCount: result.validation?.totalPatches ?? 0,
          spentUsd: result.sessionResult.usage.estimatedUsd,
          durationSeconds: result.sessionResult.usage.elapsedMs / 1000,
          terminalStatus,
          errorMessage: result.sessionResult.error ?? null,
        });
      });
    }

    return {
      ok: result.sessionResult.reason === "completed",
      sessionId,
      manifestSlug,
      reason: result.sessionResult.reason,
    };
  },
);
