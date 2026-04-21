import { and, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits, monitoredDomains, monitoringAlerts, userProfiles, users } from "@/db/schema";
import { executeAuditInProcess } from "@/inngest/functions/run-audit";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import type { AuditSummary } from "@pseolint/core";
import { sendMonitoringAlertEmail } from "@/lib/alert-email";
import { bumpRateLimit } from "@/lib/rate-limit";
import { todayDateString } from "@/lib/ids";
import { auditMode } from "@/lib/audit-mode";
import { auditLog } from "@/lib/audit-log";

const MAX_DOMAINS_PER_TICK = 20;

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
      .set({ nextRunAt: withJitter(new Date(Date.now() + 86_400_000)) })
      .where(eq(monitoredDomains.id, d.id));
    return;
  }
  auditLog("monitor.domain.picked", { monitoredDomainId: d.id, host: d.host, plan });

  const [audit] = await db
    .insert(audits)
    .values({
      userId: d.userId,
      anonSessionId: null,
      sourceUrl: d.sourceUrl,
      status: "queued",
      isPublic: false,
      expiresAt: new Date(Date.now() + 90 * 86_400_000),
    })
    .returning({ id: audits.id });

  const SAMPLE_SIZE_CEILING = 300;
  const result = await executeAuditInProcess({
    auditId: audit.id,
    url: d.sourceUrl,
    plan: plan === "pro" ? "pro" : "free",
    sampleSize: Math.min(plan === "pro" ? 200 : 50, SAMPLE_SIZE_CEILING),
  });

  const nextRunAt = computeNextRun(d.cadence);

  if (!result.ok) {
    await db
      .update(monitoredDomains)
      .set({ nextRunAt, lastRunAt: new Date() })
      .where(eq(monitoredDomains.id, d.id));
    return;
  }

  await db
    .update(monitoredDomains)
    .set({
      lastAuditId: audit.id,
      lastScore: result.score,
      lastRunAt: new Date(),
      nextRunAt,
    })
    .where(eq(monitoredDomains.id, d.id));

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
      currentScore: result.score,
    });
  }
}

function computeNextRun(cadence: "weekly" | "daily"): Date {
  const ms = cadence === "daily" ? 86_400_000 : 7 * 86_400_000;
  return withJitter(new Date(Date.now() + ms));
}

/** ±30 minute jitter so audits don't cluster at the same cron tick. */
function withJitter(d: Date): Date {
  const jitterMs = (Math.random() - 0.5) * 60 * 60 * 1000;
  return new Date(d.getTime() + jitterMs);
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
    reportId: input.currentAuditId,
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

// silence unused imports used only through drizzle operators
void gte;
void isNotNull;
void sql;
