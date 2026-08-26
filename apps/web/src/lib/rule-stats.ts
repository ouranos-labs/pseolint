import type { AnyAuditSummary } from "@/lib/audit-types";

/**
 * Collapse an audit summary into one aggregate row per rule.
 *
 * Deliberately lossy: rule id, worst severity, and a count. No URL, no page, no
 * message, no snippet. That is what lets these rows outlive the report blob
 * (deleted after 24h for anonymous audits) while staying inside what /privacy
 * already discloses about retained aggregate stats.
 */
export interface RuleStat {
  ruleId: string;
  severity: "info" | "warning" | "error" | "critical";
  findingCount: number;
}

const RANK = { info: 1, warning: 2, error: 3, critical: 4 } as const;
type Sev = keyof typeof RANK;

function isSev(s: unknown): s is Sev {
  return typeof s === "string" && s in RANK;
}

export function collectRuleStats(summary: AnyAuditSummary | null | undefined): RuleStat[] {
  const issues = (summary as { issues?: Record<string, unknown> } | null | undefined)?.issues;
  if (!issues || typeof issues !== "object") return [];

  const byRule = new Map<string, RuleStat>();
  // Every bucket counts. `informational` is the bulk of the corpus and is
  // exactly where "how common is this rule" lives — dropping it would bias the
  // aggregate toward whatever happened to be severe.
  for (const bucket of Object.values(issues)) {
    if (!Array.isArray(bucket)) continue;
    for (const f of bucket) {
      const ruleId = (f as { ruleId?: unknown })?.ruleId;
      if (typeof ruleId !== "string" || !ruleId) continue;
      const sev: Sev = isSev((f as { severity?: unknown })?.severity)
        ? ((f as { severity: Sev }).severity)
        : "info";
      const seen = byRule.get(ruleId);
      if (!seen) {
        byRule.set(ruleId, { ruleId, severity: sev, findingCount: 1 });
      } else {
        seen.findingCount += 1;
        if (RANK[sev] > RANK[seen.severity]) seen.severity = sev;
      }
    }
  }
  return [...byRule.values()];
}
