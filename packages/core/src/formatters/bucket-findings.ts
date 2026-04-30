import type { Confidence, FixEffort, RuleResult, Severity } from "../types.js";
import { inferUrlTemplate } from "../stratified-sample.js";

/**
 * A bucket of findings sharing the same `(ruleId, templateSignature)` key.
 *
 * Why bucket? On a programmatic-SEO site, a single template bug surfaces as
 * dozens (or thousands) of identical findings — one per generated page. Listing
 * them individually buries the actionable signal under noise. Bucketing
 * collapses them so the operator sees:
 *
 *   "23 instances on /templates/:slug — fix once, resolve all 23"
 *
 * instead of 23 separate finding lines. The bucket key is
 * `${ruleId}::${templateSignature ?? pageUrl ?? "__site__"}`:
 *
 *  - Same rule + same template signature -> ONE bucket with count = N.
 *  - Same rule + different templates -> separate buckets per template.
 *  - Same rule, no pageUrl (site-wide) -> its own `__site__` bucket.
 *  - Same rule + same pageUrl with no template signature -> its own bucket
 *    (count usually 1; counts > 1 collapse harmless duplicates).
 */
export interface BucketedFinding {
  ruleId: string;
  /** Null when the finding is site-wide (no pageUrl) or when no signature could be inferred. */
  templateSignature: string | null;
  count: number;
  representativeUrl: string;
  representativeMessage: string;
  representativeFix?: string;
  representativeDocsUrl?: string;
  severity: Severity;
  effort?: FixEffort;
  /** v0.4.3 — confidence of the representative finding (used for caveat rendering). */
  representativeConfidence?: Confidence;
}

const CONFIDENCE_RANK: Record<Confidence, number> = {
  speculative: 1,
  low: 2,
  medium: 3,
  high: 4,
};

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  error: 3,
  warning: 2,
  info: 1,
};

const EFFORT_RANK: Record<FixEffort, number> = {
  quick: 3,
  moderate: 2,
  structural: 1,
};

/**
 * Resolve the bucketing signature for a finding.
 *
 * Prefers the engine-enriched `templateSignature` field when present (set by
 * `enrich-findings.ts`). Falls back to `inferUrlTemplate(pageUrl)` so the
 * formatters keep working on legacy summaries that pre-date the enrichment
 * change. Returns `null` when there's no pageUrl at all (site-wide finding).
 */
function signatureFor(finding: RuleResult): string | null {
  const enriched = (finding as RuleResult & { templateSignature?: string })
    .templateSignature;
  if (enriched) return enriched;
  if (!finding.pageUrl) return null;
  try {
    return inferUrlTemplate(finding.pageUrl);
  } catch {
    return null;
  }
}

/**
 * Collapse findings that share `(ruleId, templateSignature)` into buckets.
 *
 * Output order: count DESC, then severity DESC (critical > error > warning >
 * info), then effort DESC (quick > moderate > structural), with ruleId as a
 * stable tiebreaker so snapshot tests don't flap.
 */
export function bucketByTemplate(findings: RuleResult[]): BucketedFinding[] {
  const map = new Map<string, BucketedFinding>();
  for (const f of findings) {
    const sig = signatureFor(f);
    const keyPart = sig ?? f.pageUrl ?? "__site__";
    const key = `${f.ruleId}::${keyPart}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      // Keep the highest-severity / lowest-effort representative so the
      // headline shown to the user is the most actionable variant.
      if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[existing.severity]) {
        existing.severity = f.severity;
        existing.representativeMessage = f.message;
        existing.representativeFix = f.fix;
        existing.representativeUrl = f.pageUrl ?? existing.representativeUrl;
        existing.representativeDocsUrl = f.docsUrl ?? existing.representativeDocsUrl;
        if (f.confidence !== undefined) existing.representativeConfidence = f.confidence;
      }
      if (
        f.effort &&
        (!existing.effort || EFFORT_RANK[f.effort] > EFFORT_RANK[existing.effort])
      ) {
        existing.effort = f.effort;
      }
      // Track the lowest-confidence variant so the caveat surfaces if any
      // member of the bucket is low/speculative — we don't want to hide a
      // "low confidence" caveat behind a high-confidence representative.
      if (f.confidence !== undefined) {
        const cur = existing.representativeConfidence;
        if (cur === undefined || CONFIDENCE_RANK[f.confidence] < CONFIDENCE_RANK[cur]) {
          existing.representativeConfidence = f.confidence;
        }
      }
    } else {
      map.set(key, {
        ruleId: f.ruleId,
        templateSignature: sig,
        count: 1,
        representativeUrl: f.pageUrl ?? "<site-wide>",
        representativeMessage: f.message,
        representativeFix: f.fix,
        representativeDocsUrl: f.docsUrl,
        severity: f.severity,
        effort: f.effort,
        representativeConfidence: f.confidence,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDiff !== 0) return sevDiff;
    const aE = a.effort ? EFFORT_RANK[a.effort] : 0;
    const bE = b.effort ? EFFORT_RANK[b.effort] : 0;
    if (bE !== aE) return bE - aE;
    return a.ruleId.localeCompare(b.ruleId);
  });
}
