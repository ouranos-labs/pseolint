import { and, eq, isNull } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits, monitoredDomains, domainDataSources, domainRuleOverrides, userAiKeys } from "@/db/schema";
import { uploadSummary, summaryKey } from "@/lib/r2";
import { assertSafeUrl } from "@/lib/ssrf";
import { auditSource, type AuditOptions, type AuditSummary, type StateOptions, type PageDataRecord } from "@pseolint/core";
import { auditLog } from "@/lib/audit-log";
import { openSecret } from "@/lib/secret-box";

const MAX_COST_USD = 0.50;

type RunStep = <T>(name: string, fn: () => Promise<T>) => Promise<T>;

export type RunAuditInput = {
  auditId: string;
  url: string;
  plan: "free" | "pro";
  sampleSize: number;
  /** Audit mode: "full" runs all rules; "diff" skips corpus-scoped rules. Default: "full". */
  mode?: "full" | "diff";
  /** Run state for diff-mode audits. When provided, only changed/new URLs are audited. */
  state?: StateOptions;
  /** Opt-in Playwright rendered mode (JS-heavy sites). Default: false (static fetch). */
  render?: boolean;
};

/**
 * Look up user-scoped AI key, per-domain data source, and per-domain rule overrides
 * for an audit. Each is optional; all are fetched in parallel.
 */
async function loadAuditEnrichments(auditId: string): Promise<{
  aiKey?: { provider: string; model: string | null; apiKey: string };
  dataRecords?: PageDataRecord[];
  ruleOverrides?: NonNullable<AuditOptions["rules"]>;
}> {
  const [audit] = await db
    .select({ userId: audits.userId, sourceUrl: audits.sourceUrl })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  if (!audit || !audit.userId) return {};

  let host: string;
  try { host = new URL(audit.sourceUrl).host; } catch { return {}; }

  const [domainRow, keyRow] = await Promise.all([
    db.select({ id: monitoredDomains.id })
      .from(monitoredDomains)
      .where(and(
        eq(monitoredDomains.userId, audit.userId),
        eq(monitoredDomains.host, host),
        isNull(monitoredDomains.removedAt),
      ))
      .limit(1),
    db.select({ provider: userAiKeys.provider, model: userAiKeys.model, apiKey: userAiKeys.apiKey })
      .from(userAiKeys)
      .where(eq(userAiKeys.userId, audit.userId))
      .limit(1),
  ]);

  let dataRecords: PageDataRecord[] | undefined;
  let ruleOverrides: NonNullable<AuditOptions["rules"]> | undefined;
  if (domainRow.length > 0) {
    const domainId = domainRow[0].id;
    const [ds, rover] = await Promise.all([
      db.select({ records: domainDataSources.records }).from(domainDataSources).where(eq(domainDataSources.domainId, domainId)).limit(1),
      db.select({ overrides: domainRuleOverrides.overrides }).from(domainRuleOverrides).where(eq(domainRuleOverrides.domainId, domainId)).limit(1),
    ]);
    if (ds[0]) {
      try { dataRecords = JSON.parse(ds[0].records) as PageDataRecord[]; } catch { /* ignore malformed */ }
    }
    if (rover[0]) {
      try { ruleOverrides = JSON.parse(rover[0].overrides) as NonNullable<AuditOptions["rules"]>; } catch { /* ignore */ }
    }
  }

  const aiKey = keyRow[0]
    ? { provider: keyRow[0].provider, model: keyRow[0].model, apiKey: openSecret(keyRow[0].apiKey) }
    : undefined;

  return { aiKey, dataRecords, ruleOverrides };
}

export async function executeAudit(input: RunAuditInput, runStep: RunStep) {
  const { auditId, url, plan, sampleSize, mode, state, render } = input;
  const startedAt = Date.now();
  auditLog("audit.started", { auditId, plan, sampleSize, mode: mode ?? "full", render: render ?? false });

  await runStep("mark-running", async () => {
    await db.update(audits).set({ status: "running" }).where(eq(audits.id, auditId));
  });

  const { aiKey, dataRecords, ruleOverrides } = await runStep("load-enrichments", async () =>
    loadAuditEnrichments(auditId),
  );

  let summary: AuditSummary;
  try {
    await assertSafeUrl(url);
    // AI options: BYO key wins; else managed key for Pro; else disabled.
    const ai: AuditOptions["ai"] | undefined = aiKey
      ? { enabled: true, provider: aiKey.provider, apiKey: aiKey.apiKey, model: aiKey.model ?? undefined, maxCostUsd: MAX_COST_USD }
      : plan === "pro"
        ? { enabled: true, maxCostUsd: MAX_COST_USD }
        : undefined;

    summary = await runStep("audit", async () => auditSource(url, {
      sampleSize,
      mode,
      state,
      // Core's `render` is a config object; undefined = static fetch, any object = rendered.
      render: render ? {} : undefined,
      rules: ruleOverrides,
      dataSource: dataRecords ? { records: dataRecords } : undefined,
      ai,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "audit failed";
    await db.update(audits).set({
      status: "failed", errorMessage: msg.slice(0, 500), completedAt: new Date(),
    }).where(eq(audits.id, auditId));
    auditLog("audit.failed", { auditId, err: msg, ms: Date.now() - startedAt });
    return { ok: false as const, error: msg };
  }

  const jsonKey = summaryKey(auditId);
  await runStep("upload-summary", async () => uploadSummary(jsonKey, JSON.stringify(summary)));

  const completedAt = new Date();
  const findingCount =
    summary.issues.blockers.length +
    summary.issues.shouldFix.length +
    summary.issues.informational.length;
  await runStep("mark-completed", async () => {
    await db.update(audits).set({
      status: "completed",
      risk: summary.risk,
      pageCount: summary.pageCount,
      findingCount,
      triageRootCauseCount: summary.triage?.rootCauses.length ?? null,
      triageCostUsd: summary.triage?.estimatedCostUsd != null ? String(summary.triage.estimatedCostUsd) : null,
      storageKey: jsonKey,
      completedAt,
    }).where(eq(audits.id, auditId));
  });

  // Sync the monitored-domain row so the workspace header / portfolio strip /
  // alert-delta logic see the latest risk, not just the cron-run risk.
  // Without this, `Re-audit now` and the initial add-domain audit silently
  // diverge from `/r/[slug]` (which reads `audits.risk` directly).
  await runStep("sync-monitored-domain", async () => syncMonitoredDomain(auditId, summary.risk, completedAt));

  auditLog("audit.completed", {
    auditId,
    risk: summary.risk,
    pageCount: summary.pageCount,
    findingCount,
    ms: Date.now() - startedAt,
  });
  return { ok: true as const, risk: summary.risk };
}

async function syncMonitoredDomain(auditId: string, risk: number, completedAt: Date): Promise<void> {
  const [audit] = await db
    .select({ userId: audits.userId, sourceUrl: audits.sourceUrl })
    .from(audits)
    .where(eq(audits.id, auditId))
    .limit(1);
  if (!audit?.userId) return;
  let host: string;
  try { host = new URL(audit.sourceUrl).host; } catch { return; }
  await db.update(monitoredDomains)
    .set({ lastRisk: risk, lastAuditId: auditId, lastRunAt: completedAt })
    .where(and(
      eq(monitoredDomains.userId, audit.userId),
      eq(monitoredDomains.host, host),
      isNull(monitoredDomains.removedAt),
    ));
}

/** Run the audit in-process without Inngest. Used by the monitor cron and by dev flows when workers aren't available. */
export async function executeAuditInProcess(input: RunAuditInput) {
  return executeAudit(input, (_name, fn) => fn());
}

export const runAudit = inngest.createFunction(
  { id: "run-audit", retries: 1 },
  { event: "audit/requested" },
  async ({ event, step }) => executeAudit(
    event.data,
    (name, fn) => step.run(name, fn) as unknown as ReturnType<typeof fn>,
  ),
);
