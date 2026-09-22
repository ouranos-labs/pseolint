/**
 * v0.6 Per-template scoring: aggregates findings by template cluster,
 * computes per-template verdict/risk/categories, and computes the variance
 * metric (fire-rates, uniformity, top driver).
 *
 * Also exposes `siteVerdictFromTemplates` per spec §15.1.
 *
 * See spec §4–§5, §15.1.
 */

import type {
  CategoryGrades,
  CategoryKey,
  RuleResult,
  Template,
  TemplateVariance,
  Verdict,
} from "./types.js";
import type { TemplateCandidate } from "./template-detection.js";
import { LONGTAIL_SIGNATURE } from "./template-detection.js";
import {
  RULE_IMPACTS,
  DEFAULT_RULE_IMPACT,
  CONFIDENCE_MULTIPLIER,
  categoryForRule,
  gradeForPenalty,
  instancesForFinding,
  verdictForRisk,
} from "./scoring.js";

/** Minimum template coverage fraction to count for site verdict (spec §15.1). */
const SITE_VERDICT_MIN_COVERAGE = 0.05;

const VERDICT_LADDER: Verdict[] = ["ready", "caution", "concerning", "critical"];

export function verdictRank(v: Verdict): number {
  return VERDICT_LADDER.indexOf(v);
}

/** Compute simple risk + categories from a scoped set of findings. */
function computeRiskAndCategories(
  findings: RuleResult[],
  pageCount: number,
): { risk: number; categories: CategoryGrades } {
  const bucketInfoOnly: Record<CategoryKey, number> = {
    integrity: 0, discoverability: 0, citation: 0, data: 0, audit: 0,
  };
  const bucketNonInfo: Record<CategoryKey, number> = {
    integrity: 0, discoverability: 0, citation: 0, data: 0, audit: 0,
  };
  const bucketIssues: Record<CategoryKey, number> = {
    integrity: 0, discoverability: 0, citation: 0, data: 0, audit: 0,
  };

  let blockers = 0;

  const groups = new Map<string, RuleResult[]>();
  for (const finding of findings) {
    const bucket = categoryForRule(finding.ruleId);
    if (!bucket) continue;
    if (bucket !== "audit") bucketIssues[bucket] += 1;
    if (bucket === "audit") continue;

    if (finding.severity === "critical" || finding.severity === "error") {
      blockers += instancesForFinding(finding);
    }

    const arr = groups.get(finding.ruleId) ?? [];
    arr.push(finding);
    groups.set(finding.ruleId, arr);
  }

  for (const [ruleId, group] of groups) {
    const bucket = categoryForRule(ruleId);
    if (!bucket || bucket === "audit") continue;

    const impactSpec = RULE_IMPACTS[ruleId] ?? DEFAULT_RULE_IMPACT;
    const count = group.reduce((sum, f) => sum + instancesForFinding(f), 0);
    const rawImpact = impactSpec.baseImpact + Math.max(0, count - 1) * impactSpec.perInstance;
    const cap = impactSpec.maxImpact ?? Number.POSITIVE_INFINITY;
    const cappedImpact = Math.min(cap, rawImpact);

    let bestMultiplier = 0;
    for (const f of group) {
      const conf = f.confidence ?? "high";
      const m = CONFIDENCE_MULTIPLIER[conf] ?? 1.0;
      if (m > bestMultiplier) bestMultiplier = m;
    }
    if (bestMultiplier === 0) bestMultiplier = CONFIDENCE_MULTIPLIER.high;

    const weighted = cappedImpact * bestMultiplier;
    const isInfoOnly = group.every((f) => f.severity === "info");
    if (isInfoOnly) {
      bucketInfoOnly[bucket] += weighted;
    } else {
      bucketNonInfo[bucket] += weighted;
    }
  }

  const bucketRaw: Record<CategoryKey, number> = {
    integrity: 0, discoverability: 0, citation: 0, data: 0, audit: 0,
  };
  for (const key of ["integrity", "discoverability", "citation", "data"] as CategoryKey[]) {
    const info = Math.min(50, bucketInfoOnly[key]);
    const nonInfo = Math.min(100, bucketNonInfo[key]);
    bucketRaw[key] = Math.min(100, info + nonInfo);
  }

  // Use equal weights for per-template scoring: no site-type profile here
  // (the classification-based profile applies at the site level, not per-template).
  const weighted =
    bucketRaw.integrity * 0.40 +
    bucketRaw.discoverability * 0.25 +
    bucketRaw.citation * 0.25 +
    bucketRaw.data * 0.10;

  // Blocker density floor (same formula as site-level).
  const blockerRatio = pageCount > 0 ? blockers / pageCount : 0;
  const blockerFloor =
    blockerRatio >= 0.5 ? 60 :
    blockerRatio >= 0.3 ? 45 :
    blockerRatio >= 0.15 ? 25 :
    0;
  const risk = Math.round(Math.min(100, Math.max(weighted, blockerFloor)));

  const categories: CategoryGrades = {
    integrity:       { grade: gradeForPenalty(bucketRaw.integrity),       issues: bucketIssues.integrity },
    discoverability: { grade: gradeForPenalty(bucketRaw.discoverability), issues: bucketIssues.discoverability },
    citation:        { grade: gradeForPenalty(bucketRaw.citation),        issues: bucketIssues.citation },
    data:            { grade: gradeForPenalty(bucketRaw.data),            issues: bucketIssues.data },
    audit:           { grade: "A",                                        issues: 0 },
  };

  return { risk, categories };
}

/**
 * Compute the TemplateVariance metric for a template.
 *
 * For each audited URL, we check which rules fired on it. Then:
 *   - ruleFireRates[ruleId] = URLs where rule fired / total audited URLs
 *   - uniformityScore = 1 - mean(stdev(per-rule binary fire patterns))
 *   - topDriver = rule with highest fire rate
 *
 * spec §5.1-§5.3.
 */
function computeVariance(
  auditedUrls: string[],
  findingsByUrl: Map<string, Set<string>>,
): TemplateVariance {
  if (auditedUrls.length === 0) {
    return { ruleFireRates: {}, uniformityScore: 1, topDriver: null };
  }

  // Collect all rule IDs that fired at least once across audited URLs.
  const allRules = new Set<string>();
  for (const url of auditedUrls) {
    const rules = findingsByUrl.get(url);
    if (rules) {
      for (const r of rules) allRules.add(r);
    }
  }

  if (allRules.size === 0) {
    return { ruleFireRates: {}, uniformityScore: 1, topDriver: null };
  }

  const n = auditedUrls.length;
  const ruleFireRates: Record<string, number> = {};
  const ruleStdevs: number[] = [];

  for (const ruleId of allRules) {
    // Binary fire pattern across samples (1 = fired, 0 = did not fire).
    const pattern = auditedUrls.map((url) =>
      (findingsByUrl.get(url)?.has(ruleId) ? 1 : 0) as number
    );
    const rate = pattern.reduce((s, v) => s + v, 0) / n;
    ruleFireRates[ruleId] = rate;

    // Sample standard deviation of binary pattern.
    if (n <= 1) {
      ruleStdevs.push(0);
    } else {
      const variance = pattern.reduce((s, v) => s + (v - rate) ** 2, 0) / (n - 1);
      ruleStdevs.push(Math.sqrt(variance));
    }
  }

  const avgStdev =
    ruleStdevs.length > 0
      ? ruleStdevs.reduce((s, v) => s + v, 0) / ruleStdevs.length
      : 0;
  const uniformityScore = Math.max(0, Math.min(1, 1 - avgStdev));

  let topDriver: TemplateVariance["topDriver"] = null;
  for (const [ruleId, fireRate] of Object.entries(ruleFireRates)) {
    if (!topDriver || fireRate > topDriver.fireRate) {
      topDriver = { ruleId, fireRate };
    }
  }

  return { ruleFireRates, uniformityScore, topDriver };
}

/**
 * Score all templates. Takes the full findings list (already enriched + overrides applied)
 * and the template candidates. Returns a Template[] array.
 *
 * Per-page findings are tagged with their template signature on the RuleResult.
 * Site-level findings (no pageUrl) remain untagged.
 */
export function scoreTemplates(
  findings: RuleResult[],
  candidates: TemplateCandidate[],
  urlToTemplate: Map<string, string>,
  totalDiscoveredUrls: number,
): Template[] {
  if (candidates.length === 0) return [];

  const templates: Template[] = [];

  for (const candidate of candidates) {
    // Skip longtail from per-template scoring; it's a catch-all, not a real template.
    // We still compute it but mark it as low-priority for verdict aggregation.
    const auditedUrlSet = new Set(candidate.urls);

    // Tag findings that belong to this template.
    const templateFindings: RuleResult[] = [];
    const findingsByUrl = new Map<string, Set<string>>();

    for (const finding of findings) {
      if (!finding.pageUrl) continue; // site-level finding
      if (!auditedUrlSet.has(finding.pageUrl)) continue;

      // Skip audit/* diagnostics from per-template scoring.
      if (finding.ruleId.startsWith("audit/")) continue;

      templateFindings.push(finding);

      // Track per-URL fired rules for variance metric.
      const existing = findingsByUrl.get(finding.pageUrl) ?? new Set<string>();
      existing.add(finding.ruleId);
      findingsByUrl.set(finding.pageUrl, existing);
    }

    // Tag findings with their template.
    for (const finding of findings) {
      if (finding.pageUrl && auditedUrlSet.has(finding.pageUrl) && !finding.template) {
        finding.template = candidate.signature;
      }
    }

    const auditedUrls = candidate.urls;
    const { risk, categories } = computeRiskAndCategories(templateFindings, auditedUrls.length);
    const verdict = verdictForRisk(risk);
    const variance = computeVariance(auditedUrls, findingsByUrl);

    // Collect finding IDs: use ruleId+pageUrl as a stable reference key.
    const findingIds = templateFindings.map(
      (f) => `${f.ruleId}:${f.pageUrl ?? ""}`,
    );

    templates.push({
      signature: candidate.signature,
      totalUrls: candidate.count,
      totalDiscoveredUrls,
      auditedUrls,
      verdict,
      risk,
      categories,
      variance,
      findingIds,
    });
  }

  return templates;
}

/**
 * Aggregate site verdict from per-template verdicts per spec §15.1.
 *
 * - Filter to templates with totalUrls / totalDiscoveredUrls >= 5%
 * - Long-tail bucket is excluded
 * - Take the worst verdict among qualifying templates
 * - If no template meets the 5% threshold, return null (caller uses legacy verdict)
 */
export function siteVerdictFromTemplates(
  templates: Template[],
): Verdict | null {
  const qualifying = templates.filter(
    (t) =>
      t.signature !== LONGTAIL_SIGNATURE &&
      t.totalDiscoveredUrls > 0 &&
      t.totalUrls / t.totalDiscoveredUrls >= SITE_VERDICT_MIN_COVERAGE,
  );

  if (qualifying.length === 0) return null;

  let worstVerdict: Verdict = "ready";
  for (const t of qualifying) {
    if (verdictRank(t.verdict) > verdictRank(worstVerdict)) {
      worstVerdict = t.verdict;
    }
  }

  return worstVerdict;
}
