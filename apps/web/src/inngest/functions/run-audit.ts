import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { uploadReport, reportKey } from "@/lib/r2";
import { assertSafeUrl } from "@/lib/ssrf";
import { auditSource, formatHtml, type AuditSummary } from "pseolint";

const MAX_COST_USD = 0.50;

export const runAudit = inngest.createFunction(
  { id: "run-audit", retries: 1 },
  { event: "audit/requested" },
  async ({ event, step }) => {
    const { auditId, url, plan, sampleSize } = event.data;

    await step.run("mark-running", async () => {
      await db.update(audits).set({ status: "running" }).where(eq(audits.id, auditId));
    });

    let summary: AuditSummary;
    try {
      await assertSafeUrl(url);
      summary = await step.run("audit", async () => auditSource(url, {
        sampleSize,
        ai: plan === "pro" ? { enabled: true, maxCostUsd: MAX_COST_USD } : undefined,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "audit failed";
      await db.update(audits).set({ status: "failed", errorMessage: msg.slice(0, 500), completedAt: new Date() }).where(eq(audits.id, auditId));
      return { ok: false, error: msg };
    }

    const html = formatHtml(summary);
    const key = reportKey(auditId);
    await step.run("upload", async () => uploadReport(key, html));

    await step.run("mark-completed", async () => {
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

    return { ok: true, score: summary.score };
  },
);
