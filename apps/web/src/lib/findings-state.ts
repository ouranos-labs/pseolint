import { and, eq } from "drizzle-orm";
import { inferUrlTemplate } from "@pseolint/core";
import type { RuleResult, Severity } from "@pseolint/core";
import { db } from "@/db";
import { findingsState, gscPageMetrics } from "@/db/schema";
import { detectCms, rewriteMessageForCms } from "@/lib/cms-messages";
import { monthBucketUtc } from "@/lib/gsc";

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
 * Build a `templateSignature → sum(impressions)` map from gscPageMetrics for
 * the current month. Findings are grouped by template signature (e.g.
 * `/blog/:slug`), so we aggregate URL-level impressions up to the same key.
 *
 * Returns an empty map when GSC isn't synced for this domain: callers fall
 * back to severity×pages weighting transparently.
 */
async function loadDomainImpressionsBySignature(domainId: string): Promise<Map<string, number>> {
  const rows = await db.select({
    url: gscPageMetrics.url,
    impressions: gscPageMetrics.impressions,
  })
    .from(gscPageMetrics)
    .where(and(
      eq(gscPageMetrics.domainId, domainId),
      eq(gscPageMetrics.monthBucket, monthBucketUtc()),
    ));
  const map = new Map<string, number>();
  for (const r of rows) {
    let sig: string;
    try { sig = inferUrlTemplate(r.url); } catch { sig = r.url; }
    map.set(sig, (map.get(sig) ?? 0) + r.impressions);
  }
  return map;
}

/**
 * Merge a new audit's findings into findings_state for a domain.
 *
 * Groups findings by (rule_id, template_signature). For each group: upserts the row,
 * updates last_seen, affected_page_count, severity_latest, rule_message_latest,
 * representative_url, and rank_score. When GSC metrics exist for the domain,
 * impressions are aggregated per template signature and used to weight the
 * rank: high-traffic templates with the same severity outrank low-traffic ones.
 *
 * Preserves status (does NOT resurrect snoozed or dismissed findings).
 */
export async function mergeFindings(
  domainId: string,
  findings: readonly RuleResult[],
): Promise<void> {
  const now = new Date();
  type Group = { ruleId: string; sig: string; severity: Severity; count: number; message: string; repUrl?: string };
  const groups = new Map<string, Group>();
  for (const f of findings) {
    // v0.5+: carried-forward findings come from prior state; they were not
    // re-verified this run. Excluding them keeps `lastSeenAt` honest as
    // "last actually re-evaluated" so the per-URL view can render
    // "verified N days ago" badges that mean what they say.
    if (f.carriedForward) continue;
    const sig = templateSignatureFor(f);
    const key = `${f.ruleId}::${sig}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      // Keep worst severity seen in this run.
      if (SEVERITY_WEIGHT[f.severity] > SEVERITY_WEIGHT[g.severity]) g.severity = f.severity;
    } else {
      const cms = f.pageUrl ? detectCms(f.pageUrl) : null;
      const rewritten = rewriteMessageForCms(f.message, f.ruleId, cms);
      groups.set(key, {
        ruleId: f.ruleId, sig, severity: f.severity, count: 1,
        message: rewritten, repUrl: f.pageUrl,
      });
    }
  }

  // One read across all groups, instead of one per group; keeps the
  // ratio of GSC reads to findings constant regardless of audit size.
  const sigImpressions = await loadDomainImpressionsBySignature(domainId);

  for (const g of groups.values()) {
    const impressions = sigImpressions.get(g.sig);
    const rank = rankScoreFor(g.severity, g.count, impressions).toFixed(4);
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
        // status intentionally NOT touched: preserves snoozed/dismissed.
      },
    });
  }
}
