import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { uploadReport, uploadSummary, reportKey, summaryKey } from "@/lib/r2";
import { assertSafeUrl } from "@/lib/ssrf";
import { auditSource, formatHtml, type AuditSummary, type StateOptions } from "@pseolint/core";
import { auditLog } from "@/lib/audit-log";

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
};

export async function executeAudit(input: RunAuditInput, runStep: RunStep) {
  const { auditId, url, plan, sampleSize, mode, state } = input;
  const startedAt = Date.now();
  auditLog("audit.started", { auditId, plan, sampleSize, mode: mode ?? "full" });

  await runStep("mark-running", async () => {
    await db.update(audits).set({ status: "running" }).where(eq(audits.id, auditId));
  });

  let summary: AuditSummary;
  try {
    await assertSafeUrl(url);
    summary = await runStep("audit", async () => auditSource(url, {
      sampleSize,
      mode,
      state,
      ai: plan === "pro" ? { enabled: true, maxCostUsd: MAX_COST_USD } : undefined,
    }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "audit failed";
    await db.update(audits).set({
      status: "failed", errorMessage: msg.slice(0, 500), completedAt: new Date(),
    }).where(eq(audits.id, auditId));
    auditLog("audit.failed", { auditId, err: msg, ms: Date.now() - startedAt });
    return { ok: false as const, error: msg };
  }

  const html = formatHtml(summary);
  const key = reportKey(auditId);
  const jsonKey = summaryKey(auditId);
  await runStep("upload", async () => uploadReport(key, html));
  await runStep("upload-summary", async () => uploadSummary(jsonKey, JSON.stringify(summary)));

  await runStep("mark-completed", async () => {
    await db.update(audits).set({
      status: "completed",
      score: summary.score,
      pageCount: summary.pageCount,
      findingCount: summary.findings.length,
      triageRootCauseCount: summary.triage?.rootCauses.length ?? null,
      triageCostUsd: summary.triage?.estimatedCostUsd != null ? String(summary.triage.estimatedCostUsd) : null,
      storageKey: key,
      completedAt: new Date(),
    }).where(eq(audits.id, auditId));
  });

  auditLog("audit.completed", {
    auditId,
    score: summary.score,
    pageCount: summary.pageCount,
    findingCount: summary.findings.length,
    ms: Date.now() - startedAt,
  });
  return { ok: true as const, score: summary.score };
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
