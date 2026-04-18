import type {
  AuditRecord,
  FeedbackRecord,
  TelemetryRecord,
} from "./types.js";

export interface TelemetryStats {
  totalAudits: number;
  totalFeedback: number;
  avgDurationMs: number | null;
  avgScore: number | null;
  avgFindings: number | null;
  avgPages: number | null;
  /** Audits where ai.enabled was true (success + failure). */
  triageAttempts: number;
  /** Audits where triage returned a result (excludes skipped/failed). */
  triageUsed: number;
  /** Breakdown of skip reasons from failed attempts. */
  triageSkipReasons: Record<string, number>;
  triageCacheHits: number;
  totalTokenInput: number;
  totalTokenOutput: number;
  totalEstimatedCostUsd: number;
  feedbackBreakdown: { helpful: number; unhelpful: number; skipped: number };
  firstRun: string | null;
  lastRun: string | null;
}

/**
 * Pure summary function over a set of telemetry records. Splits audits and
 * feedback, averages the audit-level metrics, and sums triage aggregates over
 * just the audits that included triage.
 */
export function aggregateTelemetry(
  records: TelemetryRecord[]
): TelemetryStats {
  const audits = records.filter(
    (r): r is AuditRecord => r.type === "audit"
  );
  const feedback = records.filter(
    (r): r is FeedbackRecord => r.type === "feedback"
  );
  const n = audits.length;
  const sum = (k: (a: AuditRecord) => number): number =>
    audits.reduce((s, a) => s + k(a), 0);
  const triageAttempts = audits.filter((a) => a.triage);
  const triageSuccesses = triageAttempts.filter((a) => a.triage!.success);
  const triageSkipReasons: Record<string, number> = {};
  for (const a of triageAttempts) {
    if (!a.triage!.success && a.triage!.skipReason) {
      // Canonicalize by the first ":"-separated kind for cleaner grouping.
      const key = a.triage!.skipReason.split(":")[0].trim() || "unknown";
      triageSkipReasons[key] = (triageSkipReasons[key] ?? 0) + 1;
    }
  }

  return {
    totalAudits: n,
    totalFeedback: feedback.length,
    avgDurationMs: n ? sum((a) => a.durationMs) / n : null,
    avgScore: n ? sum((a) => a.score) / n : null,
    avgFindings: n ? sum((a) => a.findingCount) / n : null,
    avgPages: n ? sum((a) => a.pageCount) / n : null,
    triageAttempts: triageAttempts.length,
    triageUsed: triageSuccesses.length,
    triageSkipReasons,
    triageCacheHits: triageSuccesses.filter((a) => a.triage!.cacheHit).length,
    totalTokenInput: triageSuccesses.reduce(
      (s, a) => s + a.triage!.tokenUsage.input,
      0
    ),
    totalTokenOutput: triageSuccesses.reduce(
      (s, a) => s + a.triage!.tokenUsage.output,
      0
    ),
    totalEstimatedCostUsd: triageSuccesses.reduce(
      (s, a) => s + (a.triage!.estimatedCostUsd ?? 0),
      0
    ),
    feedbackBreakdown: {
      helpful: feedback.filter((f) => f.rating === "helpful").length,
      unhelpful: feedback.filter((f) => f.rating === "unhelpful").length,
      skipped: feedback.filter((f) => f.rating === "skipped").length,
    },
    firstRun: audits.reduce<string | null>(
      (m, a) => (!m || a.timestamp < m ? a.timestamp : m),
      null
    ),
    lastRun: audits.reduce<string | null>(
      (m, a) => (!m || a.timestamp > m ? a.timestamp : m),
      null
    ),
  };
}
