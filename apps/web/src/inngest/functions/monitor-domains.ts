import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { alertsDedup, audits, findingsState, monitoredDomains, monitoringAlerts, userProfiles, users } from "@/db/schema";
import { executeAuditInProcess } from "@/inngest/functions/run-audit";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import type { AuditSummary } from "@pseolint/core";
import { sendMonitoringAlertEmail } from "@/lib/alert-email";
import { bumpRateLimit } from "@/lib/rate-limit";
import { todayDateString } from "@/lib/ids";
import { auditMode } from "@/lib/audit-mode";
import { auditLog } from "@/lib/audit-log";
import { mergeFindings } from "@/lib/findings-state";
import { evaluateAlertGate, isoWeekOf } from "@/lib/alert-gate";
import { publicSlug } from "@/lib/slug";

const MAX_DOMAINS_PER_TICK = 20;

/** Re-run a full audit at most once per 7 days; all other runs are diff-mode. */
const FULL_REAUDIT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export const monitorDomains = inngest.createFunction(
  { id: "monitor-domains", retries: 1 },
  { cron: "0 * * * *" },
  async ({ step }) => {
    if (auditMode() !== "normal") {
      auditLog("monitor.cron.start", { skipped: `mode=${auditMode()}` });
      return { ran: 0, skipped: `mode=${auditMode()}` };
    }
    auditLog("monitor.cron.start", {});

    const due = await step.run("fetch-due", async () =>
      db
        .select()
        .from(monitoredDomains)
        .where(and(
          eq(monitoredDomains.paused, false),
          lte(monitoredDomains.nextRunAt, new Date()),
          isNull(monitoredDomains.removedAt),
          // Only audit domains whose ownership has been proven via DNS TXT.
          isNotNull(monitoredDomains.verifiedAt),
        ))
        .limit(MAX_DOMAINS_PER_TICK * 3),
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

  // Monitoring audits count against the user's daily quota — same economics as ad-hoc audits.
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
  const result = await executeAuditInProcess({
    auditId: audit.id,
    url: d.sourceUrl,
    plan: plan === "pro" ? "pro" : "free",
    sampleSize: Math.min(plan === "pro" ? 200 : 50, SAMPLE_SIZE_CEILING),
    mode,
    ...(mode === "diff" && { state: { since: true, path: `.pseolint/state-${d.id}.json` } }),
  });

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
      lastScore: result.score,
      lastRunAt: now,
      // lastFullRunAt is stamped only on full runs so the 7-day window advances correctly.
      ...(isFullRun && { lastFullRunAt: now }),
      nextRunAt,
    })
    .where(eq(monitoredDomains.id, d.id));

  // Alert flow: compare against previous audit before merging findings_state.
  // Task 11 will add an alert-gate that reads findings_state; for now this runs unchanged.
  if (d.lastAuditId) {
    await maybeAlert({
      monitoredDomainId: d.id,
      userId: d.userId,
      alertEmail: d.alertEmail,
      sourceUrl: d.sourceUrl,
      threshold: d.alertThreshold,
      previousAuditId: d.lastAuditId,
      previousScore: d.lastScore ?? null,
      currentAuditId: audit.id,
      currentAuditSlug: audit.slug,
      currentScore: result.score,
    });
  }

  // Merge the fresh findings into the persistent findings_state table so the fix
  // queue stays up-to-date. Placed after the alert flow so alerts fire on the
  // pre-merge snapshot (Task 11 can change this ordering if needed).
  const currSummaryRaw = await fetchSummaryJson(summaryKey(audit.id));
  if (currSummaryRaw) {
    try {
      const currSummary = JSON.parse(currSummaryRaw) as AuditSummary;
      await mergeFindings(d.id, currSummary.findings);
    } catch {
      // Non-fatal: findings_state is best-effort; don't fail the whole run.
    }
  }

  // Alert gate: evaluate score delta + new error/critical combinations (Task 11).
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
      prevScore: d.lastScore ?? null,
      currentScore: result.score,
      newCombinations: newOnes.map((r) => ({
        ruleId: r.ruleId,
        templateSignature: r.templateSignature,
        severity: r.severityLatest,
      })),
    });
    if (gate.shouldAlert) {
      const email = await resolveRecipient(d.userId, d.alertEmail);
      if (email) {
        try {
          const newRuleIds = gate.firingCombinations.map((f) => f.ruleId);
          await sendMonitoringAlertEmail({
            to: email,
            sourceUrl: d.sourceUrl,
            previousScore: d.lastScore ?? null,
            currentScore: result.score,
            newRuleIds,
            currSummary: currSummaryRaw ? (() => { try { return JSON.parse(currSummaryRaw) as AuditSummary; } catch { return null; } })() : null,
            reportSlug: audit.slug,
          });
          // Email succeeded — now write dedup rows so we don't re-send this week.
          const week = isoWeekOf(new Date());
          for (const f of gate.firingCombinations) {
            await db
              .insert(alertsDedup)
              .values({ domainId: d.id, ruleId: f.ruleId, templateSignature: f.templateSignature, isoWeek: week })
              .onConflictDoNothing();
          }
        } catch (e) {
          auditLog("monitor.alert_gate.email_failed", { domainId: d.id, err: e instanceof Error ? e.message : String(e) });
          // Do NOT write dedup rows — let the next run retry.
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

async function maybeAlert(input: {
  monitoredDomainId: string;
  userId: string;
  alertEmail: string | null;
  sourceUrl: string;
  threshold: number;
  previousAuditId: string;
  previousScore: number | null;
  currentAuditId: string;
  currentAuditSlug: string;
  currentScore: number;
}): Promise<void> {
  const [prevSummary, currSummary] = await Promise.all([
    loadSummary(input.previousAuditId),
    loadSummary(input.currentAuditId),
  ]);
  const newRuleIds = diffNewRuleIds(prevSummary, currSummary);
  const hasNewError = newRuleIds.some((id) => {
    const f = currSummary?.findings.find((r) => r.ruleId === id);
    return f?.severity === "error" || f?.severity === "critical";
  });
  const scoreDelta = Math.abs(input.currentScore - (input.previousScore ?? input.currentScore));
  const shouldAlert = scoreDelta >= input.threshold || hasNewError;
  if (!shouldAlert) return;

  const [alert] = await db
    .insert(monitoringAlerts)
    .values({
      monitoredDomainId: input.monitoredDomainId,
      auditId: input.currentAuditId,
      previousAuditId: input.previousAuditId,
      previousScore: input.previousScore,
      currentScore: input.currentScore,
      newRuleIds,
    })
    .returning({ id: monitoringAlerts.id });

  const email = await resolveRecipient(input.userId, input.alertEmail);
  if (!email) return;

  await sendMonitoringAlertEmail({
    to: email,
    sourceUrl: input.sourceUrl,
    previousScore: input.previousScore,
    currentScore: input.currentScore,
    newRuleIds,
    currSummary,
    reportSlug: input.currentAuditSlug,
  });

  await db
    .update(monitoringAlerts)
    .set({ deliveredAt: new Date() })
    .where(eq(monitoringAlerts.id, alert.id));
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

function diffNewRuleIds(prev: AuditSummary | null, curr: AuditSummary | null): string[] {
  if (!curr) return [];
  const prevIds = new Set(prev?.findings.map((f) => f.ruleId) ?? []);
  const currIds = new Set(curr.findings.map((f) => f.ruleId));
  return Array.from(currIds).filter((id) => !prevIds.has(id));
}

async function resolveRecipient(userId: string, override: string | null): Promise<string | null> {
  if (override) return override;
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.email ?? null;
}
