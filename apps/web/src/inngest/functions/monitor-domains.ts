import { and, eq } from "drizzle-orm";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { alertsDedup, audits, findingsState, monitoredDomains, monitoringAlerts, userProfiles, users } from "@/db/schema";
import { executeAuditInProcess } from "@/inngest/functions/run-audit";
import { fetchJson, fetchSummaryJson, monitoringStateKey, summaryKey, uploadJson } from "@/lib/r2";
import type { AuditSummary } from "@pseolint/core";
import { sendMonitoringAlertEmail } from "@/lib/alert-email";
import { sendSlackAlert } from "@/lib/slack-notify";
import { bumpRateLimit } from "@/lib/rate-limit";
import { todayDateString } from "@/lib/ids";
import { auditMode } from "@/lib/audit-mode";
import { auditLog } from "@/lib/audit-log";
import { PRO_MONITOR_SAMPLE_SIZE, DOWNGRADED_MONITOR_SAMPLE_SIZE } from "@/lib/audit-limits";
import { mergeFindings } from "@/lib/findings-state";
import { evaluateAlertGate, isoWeekOf } from "@/lib/alert-gate";
import { publicSlug } from "@/lib/slug";
import { env } from "@/lib/env";
import { loadWatchedUrlsForDomain, selectDueDomains } from "@/lib/monitoring";
import { detectDegradedTemplates, fireDegradedEvents } from "@/lib/template-degraded";

const MAX_DOMAINS_PER_TICK = 20;

/** Re-run a full audit at most once per 7 days; all other runs are diff-mode. */
const FULL_REAUDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export const monitorDomains = inngest.createFunction(
  { id: "monitor-domains", retries: 2 },
  { cron: "0 * * * *" },
  async ({ step }) => {
    if (auditMode() !== "normal") {
      auditLog("monitor.cron.start", { skipped: `mode=${auditMode()}` });
      return { ran: 0, skipped: `mode=${auditMode()}` };
    }
    auditLog("monitor.cron.start", {});

    // Eligibility (including the ownership gate) lives in selectDueDomains so
    // it can be tested against a real DB: see monitor-eligibility.test.ts.
    const due = await step.run("fetch-due", async () =>
      selectDueDomains(MAX_DOMAINS_PER_TICK * 3),
    );

    // Per-host throttle: at most one audit per host per cron tick (hourly).
    // Protects target sites when many users monitor the same host.
    const seenHosts = new Set<string>();
    const selected: typeof due = [];
    for (const d of due) {
      if (selected.length >= MAX_DOMAINS_PER_TICK) break;
      if (seenHosts.has(d.host)) continue;
      seenHosts.add(d.host);
      selected.push(d);
    }

    for (const d of selected) {
      await step.run(`audit-${d.id}`, async () => runOneMonitor(d.id));
    }

    return { ran: selected.length, deferred: due.length - selected.length };
  },
);

async function runOneMonitor(monitoredDomainId: string) {
  const [d] = await db
    .select()
    .from(monitoredDomains)
    .where(eq(monitoredDomains.id, monitoredDomainId))
    .limit(1);
  if (!d) return;

  // Decide full vs diff based on how long it has been since the last full run.
  // When lastFullRunAt is null (first ever run), the difference is huge → always full.
  const now = new Date();
  const lastFull = d.lastFullRunAt ? d.lastFullRunAt.getTime() : 0;
  const isFullRun = now.getTime() - lastFull >= FULL_REAUDIT_INTERVAL_MS;
  const mode: "full" | "diff" = isFullRun ? "full" : "diff";
  auditLog("monitor.domain.dispatch", { domainId: d.id, mode });

  // Monitoring audits count against the user's daily quota: same economics as ad-hoc audits.
  const [profile] = await db
    .select({ plan: userProfiles.plan })
    .from(userProfiles)
    .where(eq(userProfiles.userId, d.userId))
    .limit(1);
  const plan = profile?.plan ?? "free";
  const today = todayDateString();
  const rlKey = plan === "pro" ? `pro:${d.userId}:${today}` : `free:${d.userId}:${today}`;
  const rlLimit = plan === "pro" ? 50 : 5;
  const { allowed } = await bumpRateLimit(rlKey, rlLimit);
  if (!allowed) {
    auditLog("monitor.domain.quota_exhausted", { monitoredDomainId: d.id, userId: d.userId, plan });
    await db
      .update(monitoredDomains)
      .set({ nextRunAt: withJitter(new Date(now.getTime() + 86_400_000)) })
      .where(eq(monitoredDomains.id, d.id));
    return;
  }
  auditLog("monitor.domain.picked", { monitoredDomainId: d.id, host: d.host, plan });

  const [audit] = await db
    .insert(audits)
    .values({
      slug: publicSlug(),
      userId: d.userId,
      anonSessionId: null,
      sourceUrl: d.sourceUrl,
      status: "queued",
      isPublic: false,
      expiresAt: new Date(now.getTime() + 90 * 86_400_000),
    })
    .returning({ id: audits.id, slug: audits.slug });

  const SAMPLE_SIZE_CEILING = 300;
  const monitorSampleSize = plan === "pro" ? PRO_MONITOR_SAMPLE_SIZE : DOWNGRADED_MONITOR_SAMPLE_SIZE;

  // v0.5+ change-driven monitoring: persist per-domain state across Inngest
  // invocations via R2 (the worker filesystem is ephemeral on Vercel).
  // Download prior state to a tmp file, point the auditor at it, upload the
  // updated file back to R2 after the audit. On the very first run for a
  // domain, R2 returns null and the auditor performs a baseline full audit.
  // On full-cycle runs (every 7 days via FULL_REAUDIT_INTERVAL_MS) we pass
  // mode="fresh" so the matrix doesn't skip anything; the rest of the time
  // auto-monitoring kicks in because prior state is present.
  const stateKey = monitoringStateKey(d.id);
  let stateTmpDir: string | null = null;
  let stateTmpPath: string | null = null;
  try {
    stateTmpDir = await mkdtemp(join(tmpdir(), `pseolint-state-${d.id}-`));
    stateTmpPath = join(stateTmpDir, "state.json");
    const priorStateJson = await fetchJson(stateKey);
    if (priorStateJson) {
      await writeFile(stateTmpPath, priorStateJson, "utf8");
    }
  } catch (e) {
    auditLog("monitor.state.download_failed", { monitoredDomainId: d.id, err: e instanceof Error ? e.message : String(e) });
    // Continue without prior state: auditor will baseline.
    stateTmpPath = null;
  }

  // v0.5.3: load the domain's watched-pages list so the engine force-refetches
  // those URLs even when diff-mode would otherwise skip them. Empty list = no
  // force header sent (clean payload). Engine-side note: in fresh mode without
  // prior state, `force` is silently ignored: fine here because the very
  // first run for a new domain has no watched pages yet.
  const watchedUrls = await loadWatchedUrlsForDomain(d.id);

  const result = await executeAuditInProcess({
    auditId: audit.id,
    url: d.sourceUrl,
    plan: plan === "pro" ? "pro" : "free",
    sampleSize: Math.min(monitorSampleSize, SAMPLE_SIZE_CEILING),
    mode,
    ...(stateTmpPath
      ? { state: { path: stateTmpPath, mode: isFullRun ? "fresh" : undefined } }
      : {}),
    ...(watchedUrls.length > 0 && { force: { urls: watchedUrls } }),
  });

  // Upload the post-audit state file back to R2 so the next monitoring tick
  // sees prior state. Best-effort: a failed upload means next run does a
  // baseline; the audit itself already succeeded. Always tear down the tmp
  // dir even if the upload fails.
  if (stateTmpPath) {
    try {
      const newStateJson = await readFile(stateTmpPath, "utf8");
      await uploadJson(stateKey, newStateJson);
    } catch (e) {
      auditLog("monitor.state.upload_failed", { monitoredDomainId: d.id, err: e instanceof Error ? e.message : String(e) });
    }
  }
  if (stateTmpDir) {
    try { await rm(stateTmpDir, { recursive: true, force: true }); } catch { /* tmp cleanup is best-effort */ }
  }

  // nextRunAt is always 24h (jittered): whether this run was diff or full is decided at
  // dispatch time by the isFullRun check, not by a separate cadence column.
  const nextRunAt = withJitter(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  if (!result.ok) {
    await db
      .update(monitoredDomains)
      .set({ nextRunAt, lastRunAt: now })
      .where(eq(monitoredDomains.id, d.id));
    return;
  }

  await db
    .update(monitoredDomains)
    .set({
      lastAuditId: audit.id,
      lastRisk: result.risk,
      lastRunAt: now,
      // lastFullRunAt is stamped only on full runs so the 7-day window advances correctly.
      ...(isFullRun && { lastFullRunAt: now }),
      nextRunAt,
    })
    .where(eq(monitoredDomains.id, d.id));

  // Merge the fresh findings into the persistent findings_state table so the fix
  // queue stays up-to-date. Placed after the alert flow so alerts fire on the
  // pre-merge snapshot (Task 11 can change this ordering if needed).
  const currSummaryRaw = await fetchSummaryJson(summaryKey(audit.id));
  if (currSummaryRaw) {
    try {
      const currSummary = JSON.parse(currSummaryRaw) as AuditSummary;
      await mergeFindings(d.id, summaryFindings(currSummary));
    } catch {
      // Non-fatal: findings_state is best-effort; don't fail the whole run.
    }
  }

  // v0.6.3, per-template verdict comparison: fire template_degraded events when a
  // template's verdict worsens between this run and the previous run. Requires a
  // prior audit (d.lastAuditId) so the very first run produces no events.
  if (d.lastAuditId && currSummaryRaw) {
    try {
      const currSummary = JSON.parse(currSummaryRaw) as AuditSummary;
      const prevSummary = await loadSummary(d.lastAuditId);
      const degraded = detectDegradedTemplates(
        prevSummary?.templates ?? [],
        currSummary.templates ?? [],
      );
      fireDegradedEvents(d.id, degraded);
    } catch {
      // Non-fatal: template degradation events are observability-only.
    }
  }

  // Alert gate: evaluate risk rise delta + new error/critical combinations (Task 11).
  // Runs after mergeFindings so firstSeenAt === lastSeenAt identifies rows new to this run.
  try {
    const newOnes = await db.select().from(findingsState).where(
      and(
        eq(findingsState.domainId, d.id),
        eq(findingsState.status, "open"),
        eq(findingsState.firstSeenAt, findingsState.lastSeenAt),
      ),
    );
    const gate = await evaluateAlertGate({
      domainId: d.id,
      prevRisk: d.lastRisk ?? null,
      currentRisk: result.risk,
      threshold: d.alertThreshold,
      newCombinations: newOnes.map((r) => ({
        ruleId: r.ruleId,
        templateSignature: r.templateSignature,
        severity: r.severityLatest,
      })),
    });
    if (gate.shouldAlert) {
      const newRuleIds = gate.firingCombinations.map((f) => f.ruleId);
      // Record the alert in history: written even without an email recipient,
      // mirroring the pre-gate maybeAlert behaviour it replaced.
      const [alertRow] = await db
        .insert(monitoringAlerts)
        .values({
          monitoredDomainId: d.id,
          auditId: audit.id,
          previousAuditId: d.lastAuditId ?? null,
          previousRisk: d.lastRisk ?? null,
          currentRisk: result.risk,
          newRuleIds,
        })
        .returning({ id: monitoringAlerts.id });

      const email = await resolveRecipient(d.userId, d.alertEmail);
      if (email) {
        try {
          await sendMonitoringAlertEmail({
            to: email,
            sourceUrl: d.sourceUrl,
            previousRisk: d.lastRisk ?? null,
            currentRisk: result.risk,
            newRuleIds,
            currSummary: currSummaryRaw ? (() => { try { return JSON.parse(currSummaryRaw) as AuditSummary; } catch { return null; } })() : null,
            reportSlug: audit.slug,
          });
          if (d.slackWebhookUrl) {
            try {
              await sendSlackAlert({
                webhookUrl: d.slackWebhookUrl,
                sourceUrl: d.sourceUrl,
                previousRisk: d.lastRisk ?? null,
                currentRisk: result.risk,
                newRuleIds,
                reportSlug: audit.slug,
                appUrl: env().BETTER_AUTH_URL,
              });
            } catch (e) {
              auditLog("monitor.alert_gate.slack_failed", {
                domainId: d.id,
                err: e instanceof Error ? e.message : String(e),
              });
            }
          }
          // Email succeeded: stamp delivery, then write dedup rows.
          await db
            .update(monitoringAlerts)
            .set({ deliveredAt: new Date() })
            .where(eq(monitoringAlerts.id, alertRow.id));
          const week = isoWeekOf(new Date());
          for (const f of gate.firingCombinations) {
            await db
              .insert(alertsDedup)
              .values({ domainId: d.id, ruleId: f.ruleId, templateSignature: f.templateSignature, isoWeek: week })
              .onConflictDoNothing();
          }
        } catch (e) {
          auditLog("monitor.alert_gate.email_failed", { domainId: d.id, err: e instanceof Error ? e.message : String(e) });
          // Do NOT write dedup rows: let the next run retry.
        }
      }
    }
  } catch {
    // Non-fatal: alert gate failure must not block the run.
  }
}

/** ±30 minute jitter so audits don't cluster at the same cron tick. */
function withJitter(date: Date): Date {
  const jitterMs = (Math.random() - 0.5) * 60 * 60 * 1000;
  return new Date(date.getTime() + jitterMs);
}

async function loadSummary(auditId: string): Promise<AuditSummary | null> {
  const raw = await fetchSummaryJson(summaryKey(auditId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuditSummary;
  } catch {
    return null;
  }
}

/** v0.4: AuditSummary no longer exposes a flat `findings` array, re-flatten from issues buckets. */
function summaryFindings(summary: AuditSummary | null): AuditSummary["issues"]["blockers"] {
  if (!summary) return [];
  return [
    ...summary.issues.blockers,
    ...summary.issues.shouldFix,
    ...summary.issues.informational,
  ];
}

async function resolveRecipient(userId: string, override: string | null): Promise<string | null> {
  if (override) return override;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.email ?? null;
}
