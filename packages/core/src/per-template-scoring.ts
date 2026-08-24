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

/** Minimum template coverage fraction to count for site verdict (spec §15.1). */
const SITE_VERDICT_MIN_COVERAGE = 0.05;

const VERDICT_LADDER: Verdict[] = ["ready", "caution", "concerning", "critical"];

export function verdictRank(v: Verdict): number {
  return VERDICT_LADDER.indexOf(v);
}

function verdictForRisk(risk: number): Verdict {
  if (risk <= 20) return "ready";
  if (risk <= 40) return "caution";
  if (risk <= 60) return "concerning";
  return "critical";
}

function gradeForPenalty(penalty: number): import("./types.js").Grade {
  if (penalty <= 20) return "A";
  if (penalty <= 40) return "B";
  if (penalty <= 60) return "C";
  if (penalty <= 80) return "D";
  return "F";
}

const CATEGORY_MAP: Record<string, CategoryKey> = {
  spam: "integrity",
  content: "integrity",
  cannibal: "integrity",
  links: "discoverability",
  tech: "discoverability",
  aeo: "citation",
  schema: "citation",
  data: "data",
  audit: "audit",
};

/**
 * Per-rule bucket overrides, mirroring `RULE_CATEGORY_OVERRIDES` in
 * `auditor.ts` (kept in sync by hand, same ESM-cycle reason as RULE_IMPACTS
 * below). A rule lands here when its namespace, chosen for code organisation,
 * doesn't match the bucket its SIGNAL belongs to.
 *
 * Without this, `links/host-section-divergence` scored into discoverability on
 * the template cards while the site score put it in integrity, so a confirmed
 * parasite section graded differently depending on which surface you read.
 */
const RULE_CATEGORY_OVERRIDES: Record<string, CategoryKey> = {
  "links/host-section-divergence": "integrity",
};

function categoryForRule(ruleId: string): CategoryKey | undefined {
  return RULE_CATEGORY_OVERRIDES[ruleId] ?? CATEGORY_MAP[ruleId.split("/")[0]];
}

/**
 * Per-rule impact model for template-scoped scoring.
 *
 * DUPLICATE OF `auditor.ts`'s `RULE_IMPACTS`, kept in sync BY HAND. It cannot
 * simply import that table: `auditor.ts` imports `scoreTemplates` and
 * `siteVerdictFromTemplates` from this module, so the reverse import would
 * close an ESM cycle. `auditor.ts` is the source of truth; every entry, value
 * and the rationale comment for it lives there.
 *
 * Keeping them in sync matters because per-template grades are computed HERE,
 * not in auditor.ts: an id missing from this table silently falls back to
 * DEFAULT_RULE_IMPACT and saturates its 25-point cap on any rule that fires
 * once per page, so the site verdict and the template cards disagree. That has
 * already happened twice - `tech/core-web-vitals`, `content/common-phrase-reuse`,
 * `content/wikipedia-paraphrase`, `content/citation-coverage` and
 * `links/host-section-divergence` drifted out, and the 2026-08-19
 * folklore-vs-fact batch added 13 more. `rule-impact-parity.test.ts` now fails
 * the build when the two tables diverge; extract them into a shared module
 * when something else forces this file to change shape.
 */
const RULE_IMPACTS: Record<string, { baseImpact: number; perInstance: number; maxImpact?: number }> = {
  "spam/near-duplicate":               { baseImpact: 25, perInstance: 5, maxImpact: 80 },
  "spam/entity-swap":                  { baseImpact: 25, perInstance: 5, maxImpact: 80 },
  "spam/doorway-pattern":              { baseImpact: 30, perInstance: 0, maxImpact: 30 },
  "spam/template-coverage":            { baseImpact: 15, perInstance: 3, maxImpact: 60 },
  "spam/template-diversity":           { baseImpact: 12, perInstance: 3, maxImpact: 50 },
  "spam/boilerplate-ratio":            { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "spam/thin-content":                 { baseImpact:  8, perInstance: 2, maxImpact: 40 },
  "spam/keyword-stuffed-title":        { baseImpact: 10, perInstance: 1, maxImpact: 30 },
  "spam/publication-velocity":         { baseImpact:  8, perInstance: 2, maxImpact: 30 },
  "cannibal/url-pattern":              { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "content/unique-value":              { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "content/meta-uniqueness":           { baseImpact:  8, perInstance: 2, maxImpact: 40 },
  "content/missing-author":            { baseImpact:  4, perInstance: 1, maxImpact: 20 },
  "content/eeat-signals":              { baseImpact:  4, perInstance: 1, maxImpact: 20 },
  "content/title-uniqueness":          { baseImpact:  8, perInstance: 2, maxImpact: 25 },
  "content/heading-structure":         { baseImpact:  5, perInstance: 1, maxImpact: 20 },
  "content/image-alt-text":            { baseImpact:  3, perInstance: 1, maxImpact: 20 },
  "content/image-attributes":          { baseImpact:  4, perInstance: 0, maxImpact: 4 },
  "content/meta-description-presence": { baseImpact:  5, perInstance: 0, maxImpact: 5 },
  "content/citation-coverage":         { baseImpact:  3, perInstance: 1, maxImpact: 15 },
  "content/translation-no-op":         { baseImpact: 30, perInstance: 10, maxImpact: 60 },
  "content/regurgitated-content":      { baseImpact: 15, perInstance: 5, maxImpact: 35 },
  "content/common-phrase-reuse":       { baseImpact: 12, perInstance: 4, maxImpact: 30 },
  "content/wikipedia-paraphrase":      { baseImpact: 10, perInstance: 3, maxImpact: 25 },
  "content/value-add":                 { baseImpact: 25, perInstance: 8, maxImpact: 50 },
  "tech/canonical-consistency":        { baseImpact:  8, perInstance: 1, maxImpact: 25 },
  "tech/canonical-noindex-conflict":   { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "tech/robots-noindex-conflict":      { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "tech/redirect-chain":               { baseImpact:  5, perInstance: 1, maxImpact: 25 },
  "tech/sitemap-completeness":         { baseImpact:  8, perInstance: 1, maxImpact: 30 },
  "tech/robots-sitemap-presence":      { baseImpact:  8, perInstance: 0, maxImpact: 8 },
  "tech/soft-404":                     { baseImpact:  6, perInstance: 1, maxImpact: 30 },
  "tech/hreflang-consistency":         { baseImpact:  5, perInstance: 0, maxImpact: 5 },
  "tech/og-completeness":              { baseImpact:  4, perInstance: 1, maxImpact: 20 },
  "tech/core-web-vitals":              { baseImpact:  5, perInstance: 1, maxImpact: 25 },
  "tech/hreflang-validity":            { baseImpact:  5, perInstance: 0, maxImpact: 5 },
  "tech/html-size":                    { baseImpact:  8, perInstance: 1, maxImpact: 25 },
  "tech/language-mismatch":            { baseImpact:  6, perInstance: 0, maxImpact: 6 },
  "tech/meta-robots-conflict":         { baseImpact: 12, perInstance: 1, maxImpact: 20 },
  "tech/resource-weight":              { baseImpact:  6, perInstance: 0, maxImpact: 6 },
  "tech/robots-txt-limits":            { baseImpact:  5, perInstance: 2, maxImpact: 10 },
  "tech/sitemap-hygiene":              { baseImpact:  6, perInstance: 3, maxImpact: 20 },
  "tech/snippet-suppression":          { baseImpact:  6, perInstance: 0, maxImpact: 6 },
  "tech/viewport-meta":                { baseImpact:  6, perInstance: 0, maxImpact: 6 },
  "tech/csr-bailout":                  { baseImpact: 10, perInstance: 0, maxImpact: 10 },
  "tech/robots-compliance":            { baseImpact: 10, perInstance: 0, maxImpact: 10 },
  "links/orphan-pages":                { baseImpact:  5, perInstance: 1, maxImpact: 25 },
  "links/dead-ends":                   { baseImpact:  3, perInstance: 1, maxImpact: 20 },
  "links/cluster-connectivity":        { baseImpact:  5, perInstance: 1, maxImpact: 25 },
  "links/link-depth":                  { baseImpact:  3, perInstance: 1, maxImpact: 20 },
  "links/crawlable-anchors":           { baseImpact:  8, perInstance: 0, maxImpact: 8 },
  "links/unreachable-from-root":       { baseImpact:  8, perInstance: 0, maxImpact: 8 },
  "links/generic-anchor-text":         { baseImpact:  3, perInstance: 0, maxImpact: 3 },
  "links/host-section-divergence":     { baseImpact: 15, perInstance: 5, maxImpact: 45 },
  "aeo/citable-facts":                 { baseImpact:  2, perInstance: 1, maxImpact: 25 },
  "aeo/answer-first":                  { baseImpact:  3, perInstance: 1, maxImpact: 25 },
  "aeo/summary-bait":                  { baseImpact:  4, perInstance: 1, maxImpact: 25 },
  "aeo/crawler-access":                { baseImpact:  8, perInstance: 0, maxImpact: 8 },
  "aeo/freshness-signals":             { baseImpact:  2, perInstance: 1, maxImpact: 20 },
  "aeo/llms-txt":                      { baseImpact:  4, perInstance: 0, maxImpact: 4 },
  "aeo/faq-coverage":                  { baseImpact:  2, perInstance: 1, maxImpact: 15 },
  "aeo/content-modularity":            { baseImpact:  2, perInstance: 1, maxImpact: 15 },
  "schema/json-ld-valid":              { baseImpact:  8, perInstance: 2, maxImpact: 35 },
  "schema/required-fields":            { baseImpact:  6, perInstance: 1, maxImpact: 30 },
  "schema/consistency":                { baseImpact:  3, perInstance: 1, maxImpact: 15 },
  "data/missing-binding":              { baseImpact:  8, perInstance: 0, maxImpact: 8 },
  "data/identical-across-pages":       { baseImpact:  8, perInstance: 2, maxImpact: 30 },
};
const DEFAULT_RULE_IMPACT = { baseImpact: 5, perInstance: 1, maxImpact: 25 };

const CONFIDENCE_MULTIPLIER: Record<string, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
  speculative: 0.1,
};

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

    if (finding.severity === "critical" || finding.severity === "error") blockers += 1;

    const arr = groups.get(finding.ruleId) ?? [];
    arr.push(finding);
    groups.set(finding.ruleId, arr);
  }

  for (const [ruleId, group] of groups) {
    const bucket = categoryForRule(ruleId);
    if (!bucket || bucket === "audit") continue;

    const impactSpec = RULE_IMPACTS[ruleId] ?? DEFAULT_RULE_IMPACT;
    const count = group.length;
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
