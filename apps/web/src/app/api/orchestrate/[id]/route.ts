import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orchestratorSessions, fixManifests } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { auditLog } from "@/lib/audit-log";
import { inngest } from "@/lib/inngest";

export const runtime = "nodejs";

/**
 * Poll endpoint: returns the current state of an orchestrator session,
 * plus the manifest slug if one was produced. Owner-only: surfaces
 * 404 (not 403) for foreign sessions to avoid leaking session ids.
 *
 * Live event streaming via SSE is Phase 5 batch 2.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let session;
  try {
    session = await requireSession();
  } catch (r) {
    return r as Response;
  }

  const { id } = await params;

  const [row] = await db
    .select()
    .from(orchestratorSessions)
    .where(eq(orchestratorSessions.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.userId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Look up the manifest slug if the session produced one. Cheap join on
  // session_id; index on fix_manifest.session_id keeps it O(1).
  const [manifest] = await db
    .select({
      slug: fixManifests.slug,
      verdict: fixManifests.verdict,
      validPatchCount: fixManifests.validPatchCount,
      totalPatchCount: fixManifests.totalPatchCount,
      pagePatchCount: fixManifests.pagePatchCount,
      templatePatchCount: fixManifests.templatePatchCount,
      domainPatchCount: fixManifests.domainPatchCount,
    })
    .from(fixManifests)
    .where(eq(fixManifests.sessionId, id))
    .limit(1);

  return NextResponse.json({
    sessionId: row.id,
    domain: row.domain,
    status: row.status,
    reason: row.reason,
    budgetUsd: Number(row.budgetUsd),
    spentUsd: Number(row.spentUsd),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    toolCallCount: row.toolCallCount,
    durationMs: row.durationMs,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    manifest: manifest ?? null,
  });
}

/**
 * Cancel a queued or running orchestrator session.
 *
 * Best-effort semantics: marks the DB row as `aborted`. The Inngest
 * function in flight cannot be remotely interrupted in-step (the AI SDK's
 * tool loop runs to its current step boundary), so the user understands
 * "cancel = no new work, in-flight tool results may still bill."
 *
 * Owner-only. 404 (not 403) for foreign sessions to avoid id-existence leak.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let session;
  try {
    session = await requireSession();
  } catch (r) {
    return r as Response;
  }

  const { id } = await params;

  const [row] = await db
    .select({ userId: orchestratorSessions.userId, status: orchestratorSessions.status })
    .from(orchestratorSessions)
    .where(eq(orchestratorSessions.id, id))
    .limit(1);
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!["queued", "running"].includes(row.status)) {
    return NextResponse.json(
      { error: `cannot cancel session in status ${row.status}` },
      { status: 409 },
    );
  }

  await db
    .update(orchestratorSessions)
    .set({
      status: "aborted",
      reason: "user_cancelled",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(orchestratorSessions.id, id),
        inArray(orchestratorSessions.status, ["queued", "running"]),
      ),
    );

  // Dispatch the cancellation event to Inngest. The function declares
  // `cancelOn: [{ event: "orchestrator/cancel-requested", match: "data.sessionId" }]`
  //: Inngest matches the sessionId and aborts the in-flight function,
  // which stops the next LLM step from billing. The current step's LLM
  // call (if mid-flight) still completes and bills, since the AI SDK has
  // no mid-call cancellation hook for tool-use loops.
  try {
    await inngest.send({
      name: "orchestrator/cancel-requested",
      data: { sessionId: id },
    });
  } catch (e) {
    // Inngest dispatch failure is non-fatal: DB is the source of truth.
    // The poll endpoint will surface status=aborted regardless. Logging
    // with structured args (not template literal) avoids format-string
    // CWE-134 false-positives from static analysis on user-derived `id`.
    console.error("[orchestrator] cancel event dispatch failed", {
      sessionId: id,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  auditLog("orchestrator.failed", { sessionId: id, reason: "user_cancelled" });

  return NextResponse.json({ sessionId: id, status: "aborted" });
}
