import { inferUrlTemplate } from "@pseolint/core";
import type { RuleResult, Severity } from "@pseolint/core";
import { db } from "@/db";
import { findingsState } from "@/db/schema";

/** Stable key for domain-scoped suppressions. */
export function templateSignatureFor(finding: RuleResult): string {
  if (!finding.pageUrl) return "__global__";
  try {
    return inferUrlTemplate(finding.pageUrl);
  } catch {
    return finding.pageUrl;
  }
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  info: 1, warning: 4, error: 10, critical: 25,
};

/** GSC-weighted rank if impressions known, else severity×pages fallback. */
export function rankScoreFor(severity: Severity, affectedPages: number, impressions?: number): number {
  const base = SEVERITY_WEIGHT[severity] * Math.max(1, affectedPages);
  if (impressions === undefined) return base;
  return Math.log1p(impressions) * base;
}

/**
 * Merge a new audit's findings into findings_state for a domain.
 *
 * Groups findings by (rule_id, template_signature). For each group: upserts the row,
 * updates last_seen, affected_page_count, severity_latest, rule_message_latest,
 * representative_url, and rank_score (without impressions — GSC join happens in v1.1).
 *
 * Preserves status (does NOT resurrect snoozed or dismissed findings).
 */
export async function mergeFindings(
  domainId: string,
  findings: readonly RuleResult[],
  _domainImpressions?: number,
): Promise<void> {
  const now = new Date();
  type Group = { ruleId: string; sig: string; severity: Severity; count: number; message: string; repUrl?: string };
  const groups = new Map<string, Group>();
  for (const f of findings) {
    const sig = templateSignatureFor(f);
    const key = `${f.ruleId}::${sig}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      // Keep worst severity seen in this run.
      if (SEVERITY_WEIGHT[f.severity] > SEVERITY_WEIGHT[g.severity]) g.severity = f.severity;
    } else {
      groups.set(key, {
        ruleId: f.ruleId, sig, severity: f.severity, count: 1,
        message: f.message, repUrl: f.pageUrl,
      });
    }
  }

  for (const g of groups.values()) {
    const rank = rankScoreFor(g.severity, g.count).toFixed(4);
    await db.insert(findingsState).values({
      domainId, ruleId: g.ruleId, templateSignature: g.sig,
      severityLatest: g.severity,
      affectedPageCount: g.count,
      rankScore: rank,
      ruleMessageLatest: g.message,
      representativeUrl: g.repUrl,
      firstSeenAt: now,
      lastSeenAt: now,
    }).onConflictDoUpdate({
      target: [findingsState.domainId, findingsState.ruleId, findingsState.templateSignature],
      set: {
        severityLatest: g.severity,
        affectedPageCount: g.count,
        rankScore: rank,
        ruleMessageLatest: g.message,
        representativeUrl: g.repUrl,
        lastSeenAt: now,
        // status intentionally NOT touched — preserves snoozed/dismissed.
      },
    });
  }
}
