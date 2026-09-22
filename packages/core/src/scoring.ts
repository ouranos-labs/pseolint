/**
 * Shared scoring: impact tables, category map, instance counts, and
 * scoreFromFindings. Imported by auditor.ts (site path) and
 * per-template-scoring.ts (template path) so the two cannot drift.
 *
 * See docs/superpowers/specs/2026-09-22-scoring-honesty-unmute.md §3.0.
 */

import type {
  CategoryGrades,
  CategoryKey,
  Confidence,
  Grade,
  RuleResult,
  Severity,
  Verdict,
} from "./types.js";
import type { SiteClassification, SiteType } from "./site-classifier.js";

/**
 * Maps the v0.3 ruleId namespace prefix to the v0.4 four-bucket category.
 * Used by `scoreFromFindings` to bucket findings without changing rule IDs.
 */
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
 * Per-rule category overrides: take precedence over the namespace-level
 * CATEGORY_MAP. A rule lands here when its namespace (chosen for code
 * organisation) doesn't match the scoring bucket its *signal* belongs to.
 *
 * `links/host-section-divergence` lives in the links namespace because it reads
 * the internal-link graph, but semantically it detects a spam-policy violation
 * (Google's May 2024 site-reputation-abuse): an INTEGRITY signal, not a
 * discoverability one. Without this override it scored in the discoverability
 * bucket (0.15 weight on programmatic-directory), so a confirmed parasite
 * section moved the risk score by ~2pts despite registering as a blocker.
 */
const RULE_CATEGORY_OVERRIDES: Record<string, CategoryKey> = {
  "links/host-section-divergence": "integrity",
};

export function categoryForRule(ruleId: string): CategoryKey | undefined {
  return RULE_CATEGORY_OVERRIDES[ruleId] ?? CATEGORY_MAP[ruleId.split("/")[0]];
}

/**
 * v0.4.3: site-type-aware scoring profile. Each profile defines:
 *   - `categoryWeights`: how much each category contributes to the verdict.
 *     Must sum to 1.0 (audit always 0).
 *   - `severityOverrides`: ruleId → final severity. Applied AFTER the rule
 *     emits its native severity, BEFORE bucketing. So a rule that fires as
 *     `error` but is overridden to `info` for this site type will not
 *     increment `blockers`.
 *   - `confidenceOverrides`: ruleId → final confidence. Same timing as
 *     severity overrides. Drives the per-finding caveat in formatters and
 *     the impact multiplier in `scoreFromFindings`.
 *
 * Threshold: site-type profiles only apply when the classifier is at least
 * 70% confident. Below that we fall back to the conservative "unclear"
 * defaults: never demote findings on a site we can't confidently classify.
 */
interface ScoringProfile {
  /** Per-category weight; must sum to 1.0. */
  categoryWeights: Record<CategoryKey, number>;
  /** ruleId → severity remap. Applied AFTER the rule emits its native severity. */
  severityOverrides: Record<string, Severity>;
  /** ruleId → confidence remap. Applied AFTER the rule emits its native confidence. */
  confidenceOverrides: Record<string, Confidence>;
}

const SCORING_PROFILES: Record<SiteType, ScoringProfile> = {
  "small-marketing": {
    categoryWeights: { integrity: 0.30, discoverability: 0.40, citation: 0.20, data: 0.05, audit: 0 },
    severityOverrides: {
      "aeo/citable-facts":      "info",
      "aeo/answer-first":       "info",
      "aeo/summary-bait":       "warning",
      // CSR-bailout on a small-marketing SPA is lower-stakes (a deliberately
      // client-only marketing widget); keep visible but don't tank the verdict.
      "tech/csr-bailout":       "info",
      // 2026-05-03 calibration round 5: Segment integrations had 24 thin
      // pages (200-300 words is correct for a catalog record). thin-content
      // contributing capped 40 impact pushed integrity to its 100 cap → 30
      // contribution at small-marketing weight, which alone tripped
      // 'concerning'. Demoting to info keeps the signal visible without
      // tanking the verdict on catalog-shape sites mis-classified as
      // small-marketing. Real marketing sites (linear.app etc) don't
      // normally have many sub-300-word pages so this won't hide quality
      // issues there.
      "spam/thin-content":      "info",
      "aeo/freshness-signals":  "info",
      "content/missing-author": "info",
      // 2026-05-03 calibration round 3: Segment integrations classified as
      // small-marketing@0.88 and tripped doorway-pattern 300× critical
      // (catalog records are thin + entity-swap by design, not actually a
      // doorway funnel). The classifier mistakes catalog directories as
      // small-marketing; this demotion absorbs that mis-classification
      // without weakening detection on actual small-marketing sites
      // (linear.app, supabase.com; none of which produce entity-swap pairs).
      "spam/doorway-pattern":   "warning",
      // 2026-05-03 calibration round 4: spam/boilerplate-ratio fired ERROR
      // on Segment's integration directory (24 pages, 60%+ shared template
      // chrome). On a marketing-template site the rule is correct: repeated
      // "About us" / "Pricing" copy across pages IS a quality issue. On a
      // catalog mis-classified to small-marketing, the shared chrome IS the
      // template, by design. Demote to warning here; real marketing sites
      // (linear.app, supabase.com) won't trip it because their corpus is
      // page-diverse, but catalog-shape pages classified as small-marketing
      // (Segment, Wise) won't tank the verdict.
      "spam/boilerplate-ratio": "warning",
      // 2026-05-03 v0.5.2 round 10: og-completeness, heading-structure,
      // image-alt-text were added as new rules and tipped Segment from
      // concerning → critical because catalog/template-driven sites
      // commonly have shared OG defaults, weird H1 patterns (multiple H1s
      // for repeated nav cards), and unlabelled logo grids. These are
      // real findings on isolated sites but typical for catalog shape;
      // demote to info here so the signal stays visible without driving
      // the verdict.
      "tech/og-completeness":      "info",
      "content/heading-structure": "info",
      "content/image-alt-text":    "info",
    },
    confidenceOverrides: {
      "aeo/citable-facts":      "low",
      "aeo/answer-first":       "low",
      "aeo/summary-bait":       "medium",
      "spam/thin-content":      "low",
      "aeo/freshness-signals":  "low",
      "content/missing-author": "low",
      "spam/doorway-pattern":   "medium",
      "spam/boilerplate-ratio": "medium",
      "tech/og-completeness":      "low",
      "content/heading-structure": "low",
      "content/image-alt-text":    "low",
    },
  },
  "blog": {
    categoryWeights: { integrity: 0.40, discoverability: 0.25, citation: 0.30, data: 0.05, audit: 0 },
    severityOverrides: {
      "content/missing-author": "error",
      "spam/thin-content":      "error",
    },
    confidenceOverrides: {},
  },
  "programmatic-directory": {
    categoryWeights: { integrity: 0.55, discoverability: 0.15, citation: 0.20, data: 0.10, audit: 0 },
    // Symmetry argument: every other profile has severity overrides for the
    // rules that mis-fit its shape (`docs` demotes AEO + author rules,
    // `ecommerce` demotes `aeo/citable-facts`, `small-marketing` demotes 4
    // rules). `programmatic-directory` is the site type *most* structurally
    // different from the "page = article" assumptions the AEO and EEAT rules
    // are calibrated against, yet was the only profile with no overrides.
    //
    // Pre-calibration adjustment: demote (never escalate) the rules that
    // first-principles analysis predicts will false-positive on catalog-
    // shaped sites (Zapier integrations, G2 categories, Wise currency pairs,
    // etc.). A reputable-pSEO calibration corpus + runner has been added
    // (scripts/calibration-corpus.ts); these overrides will be
    // tightened or loosened based on actual fire-rates measured against
    // sites that demonstrably win in production. See
    // docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md.
    severityOverrides: {
      // Catalog pages are tables, not prose. AEO rules calibrated on
      // editorial content over-fire here.
      "aeo/citable-facts":      "info",
      "aeo/answer-first":       "info",
      "aeo/content-modularity": "info",
      // 2026-05-03 calibration: freshness-signals fired on every page of
      // every reputable pSEO site. Catalog freshness is expressed via the
      // data (live currency rates, current job listings, current pricing),
      // not via visible "last updated" stamps. Demote.
      "aeo/freshness-signals":  "info",
      // Authorship lives at the platform level (operator's about page),
      // not on every catalog record. Following the rule's "add a byline"
      // fix on a Zillow listing would actively make the page worse.
      "content/missing-author": "info",
      "content/eeat-signals":   "info",
      // Template uniformity is correct for catalogs by design. Keep the
      // signal but cap at warning, never error.
      "spam/template-diversity": "warning",
      // 2026-05-03 v0.5.2 round 10: same catalog logic as small-marketing.
      "tech/og-completeness":      "info",
      "content/heading-structure": "info",
      "content/image-alt-text":    "info",
      // 2026-05-03 calibration round 2: catalogs are near-duplicate by
      // design. spam/near-duplicate fires CRITICAL on every catalog pair.
      // Demote to warning: keeps the signal visible without dominating
      // the score.
      "spam/near-duplicate":    "warning",
      // 2026-05-03 calibration round 5: catalog records are by-design
      // shorter than the 300-word default. Demote to info on programmatic-
      // directory; the data IS the content.
      "spam/thin-content":      "info",
      // 2026-05-03 calibration round 2: doorway-pattern fires CRITICAL on
      // every (thin + entity-swap) pair. On Segment integrations, integration
      // pages are thin (200-300 words is the right amount for a directory
      // record) and entity-swap (slack/google-sheets, slack/airtable, …) by
      // design. The composite signal is genuinely true but the *intent*
      // (doorway funnel) doesn't match the reality (catalog record).
      // Demoting to warning preserves the signal without tanking the score.
      "spam/doorway-pattern":   "warning",
      // 2026-05-03 calibration round 4: catalog pages share template chrome
      // by design; same as `spam/template-diversity`, this signal is
      // structurally true on programmatic-directories.
      "spam/boilerplate-ratio": "warning",
    },
    confidenceOverrides: {
      "aeo/citable-facts":      "low",
      "aeo/answer-first":       "low",
      "aeo/content-modularity": "low",
      "aeo/freshness-signals":  "low",
      "content/missing-author": "low",
      "content/eeat-signals":   "low",
      "spam/template-diversity": "medium",
      "spam/near-duplicate":    "medium",
      "spam/doorway-pattern":   "medium",
      "spam/boilerplate-ratio": "medium",
      "spam/thin-content":      "low",
      "tech/og-completeness":      "low",
      "content/heading-structure": "low",
      "content/image-alt-text":    "low",
    },
  },
  "ecommerce": {
    categoryWeights: { integrity: 0.20, discoverability: 0.40, citation: 0.15, data: 0.25, audit: 0 },
    severityOverrides: {
      "aeo/citable-facts":      "info",
      "schema/required-fields": "error",
      // Marketplace product titles are attribute lists by convention
      // ("Sony WH-1000XM5, Black, Over-Ear, Noise Cancelling, 30h Battery"),
      // which is the exact shape spam/keyword-stuffed-title looks for. On a
      // catalog that shape is the store's spec line, not an attempt to
      // manipulate rankings: keep the signal visible, never let it score.
      "spam/keyword-stuffed-title": "info",
    },
    confidenceOverrides: {
      "aeo/citable-facts":      "low",
    },
  },
  "docs": {
    categoryWeights: { integrity: 0.30, discoverability: 0.30, citation: 0.30, data: 0.10, audit: 0 },
    severityOverrides: {
      "aeo/citable-facts":      "info",
      "aeo/answer-first":       "warning",
      "content/missing-author": "info",
    },
    confidenceOverrides: {
      "aeo/citable-facts":      "low",
      "aeo/answer-first":       "low",
      "content/missing-author": "low",
    },
  },
  "unclear": {
    categoryWeights: { integrity: 0.50, discoverability: 0.20, citation: 0.25, data: 0.05, audit: 0 },
    // 2026-05-03 calibration round 2: the original "stay strict when unsure"
    // intent meant that 4 of 5 reputable pSEO sites that classified as
    // unclear (Zapier integrations, Typeform templates, Jasper templates,
    // Numbeo cost-of-living) failed their verdict ceiling. The dominant
    // driver was always `aeo/citable-facts` at full error severity, but
    // catalog/template-gallery pages don't have prose, so the rule fires
    // for a STRUCTURAL reason (page is a table, not a paragraph), not a
    // QUALITY reason. Demoting the structurally-incompatible rules to
    // info on `unclear` is conservative:
    //   - if site is genuinely editorial and got mis-classified, signals
    //     still surface (just info, not error); author can act on them.
    //   - if site is catalog and got mis-classified to unclear, verdict
    //     no longer falsely tanks.
    // Real spam signals (near-dup, doorway, thin) keep their severity.
    severityOverrides: {
      "aeo/citable-facts":      "info",
      "aeo/answer-first":       "info",
      "aeo/content-modularity": "info",
      "aeo/freshness-signals":  "info",
      "content/missing-author": "info",
      "content/eeat-signals":   "info",
      // 2026-05-03 calibration round 3: Airbyte classified as unclear@0.5
      // and scored concerning despite all info-severity findings in the
      // top 5. The 8 critical "blockers" came from spam/near-duplicate,
      // spam/entity-swap, spam/doorway-pattern firing 1-2× each on its
      // connectors directory: invisible per-rule but cumulatively pushing
      // the score over 'caution'. On unclear sites we cannot tell whether
      // these triple-fires represent a real doorway or a catalog; the
      // calibration corpus shows reputable catalogs hitting them more
      // often than real doorways do. Demote to warning: keeps the signal
      // visible (it appears in shouldFix bucket, with full message) without
      // tanking the verdict on a structurally-ambiguous site.
      "spam/near-duplicate":    "warning",
      "spam/entity-swap":       "warning",
      "spam/doorway-pattern":   "warning",
      // 2026-05-03 calibration round 4: same boilerplate logic on unclear:
      // we can't tell whether the site is a marketing site (boilerplate IS
      // a quality issue) or a catalog (it isn't), so demote conservatively.
      "spam/boilerplate-ratio": "warning",
      // 2026-05-03 calibration round 5: same thin-content logic on unclear.
      // Catalog-shape sites that classify as unclear (Zapier, Typeform,
      // Jasper) had thin-content firing at error on the 5-15% of pages
      // shorter than the 300-word default. Demote to info: surfaces the
      // signal without driving the verdict on a structurally-ambiguous site.
      "spam/thin-content":      "info",
      // 2026-05-03 v0.5.2 round 10: same demotions as programmatic-
      // directory profile; these tipped Webflow/Zapier/Numbeo/Airbyte
      // back into concerning territory because they classify as unclear
      // and the new rules aren't yet calibrated for catalog shape.
      "tech/og-completeness":      "info",
      "content/heading-structure": "info",
      "content/image-alt-text":    "info",
    },
    confidenceOverrides: {
      "aeo/citable-facts":      "low",
      "aeo/answer-first":       "low",
      "aeo/content-modularity": "low",
      "aeo/freshness-signals":  "low",
      "content/missing-author": "low",
      "content/eeat-signals":   "low",
      "spam/near-duplicate":    "medium",
      "spam/entity-swap":       "medium",
      "spam/doorway-pattern":   "medium",
      "spam/boilerplate-ratio": "medium",
      "spam/thin-content":      "low",
      "tech/og-completeness":      "low",
      "content/heading-structure": "low",
      "content/image-alt-text":    "low",
    },
  },
};

/**
 * Pick the scoring profile for a classification. Falls back to `unclear`
 * (the conservative default) when classifier confidence is below 70%.
 *
 * v0.5.3: when `applyDegenerationGuard` has tripped, we return a synthetic
 * profile that reuses `unclear` category weights but applies NO severity /
 * confidence overrides. The whole point of the guard is to expose the
 * natural rule severities on degenerate corpora; the demotion table on
 * `unclear` would re-mask `spam/thin-content` and `aeo/citable-facts` if we
 * just used SCORING_PROFILES.unclear here.
 */
export function profileFor(classification: SiteClassification | undefined): ScoringProfile {
  if (classification && classification.signals.some((s) => s.kind === "degeneration-guard-tripped")) {
    return {
      categoryWeights: SCORING_PROFILES.unclear.categoryWeights,
      severityOverrides: {},
      confidenceOverrides: {},
    };
  }
  if (!classification || classification.confidence < 0.7) return SCORING_PROFILES.unclear;
  return SCORING_PROFILES[classification.type] ?? SCORING_PROFILES.unclear;
}

/**
 * v0.4.3: per-rule impact model. Replaces flat severity weights so a single
 * "error" doesn't always cost the same: a `spam/near-duplicate` cluster of 5
 * pages should hurt much more than a single `aeo/citable-facts` warning, even
 * though both could theoretically be "error" severity.
 *
 *   impact = min(maxImpact, baseImpact + (count - 1) * perInstance)
 *           × CONFIDENCE_MULTIPLIER[confidence]
 *
 * The result is then summed into the rule's category bucket; the bucket is
 * capped at 100 before category weighting.
 */
export interface RuleImpact {
  /** First-occurrence penalty. */
  baseImpact: number;
  /** Per-additional-instance penalty (capped; see below). */
  perInstance: number;
  /** Hard cap on per-rule contribution (so no single rule can dominate). */
  maxImpact?: number;
}

export const RULE_IMPACTS: Record<string, RuleImpact> = {
  // SpamBrain: high baseline, count amplifies (cluster matters)
  "spam/near-duplicate":      { baseImpact: 25, perInstance: 5,  maxImpact: 80 },
  "spam/entity-swap":         { baseImpact: 25, perInstance: 5,  maxImpact: 80 },
  "spam/doorway-pattern":     { baseImpact: 30, perInstance: 5,  maxImpact: 80 },
  "spam/template-coverage":   { baseImpact: 15, perInstance: 3,  maxImpact: 60 },
  "spam/template-diversity":  { baseImpact: 12, perInstance: 3,  maxImpact: 50 },
  "spam/boilerplate-ratio":   { baseImpact: 10, perInstance: 2,  maxImpact: 40 },
  "spam/thin-content":        { baseImpact: 8,  perInstance: 2,  maxImpact: 40 },
  // Unlike the page-scoped rules pinned at perInstance 0, this rule's count is
  // NOT the sample size: titles vary page to page and the rule fires on 8% to
  // 96% of a site's sample, never uniformly. So "how many of this site's titles
  // are keyword lists" is a real measurement of how far the practice reaches,
  // and it scales - but with a step of 1 rather than the 2-5 the pair-based
  // spam rules use, because the remedy is usually a single title template.
  "spam/keyword-stuffed-title":{ baseImpact: 10, perInstance: 1,  maxImpact: 30 },
  "spam/publication-velocity":{ baseImpact: 8,  perInstance: 2,  maxImpact: 30 },
  "cannibal/url-pattern":     { baseImpact: 10, perInstance: 2,  maxImpact: 40 },

  // Content
  "content/unique-value":     { baseImpact: 10, perInstance: 2,  maxImpact: 40 },
  "content/meta-uniqueness":  { baseImpact: 8,  perInstance: 2,  maxImpact: 40 },
  "content/missing-author":   { baseImpact: 4,  perInstance: 1,  maxImpact: 20 },
  "content/eeat-signals":     { baseImpact: 4,  perInstance: 1,  maxImpact: 20 },
  // 2026-05-03 v0.5.2 blind-spot fixes
  "content/title-uniqueness": { baseImpact: 8,  perInstance: 2,  maxImpact: 25 }, // 2026-05-03 round 11: title is high-impact but the original 50-cap was disproportionate to other content rules and tipped Typeform into critical on a 6-finding cluster. Keep the rule at native error severity (duplicate titles ARE real bugs); just don't let one rule dominate the integrity bucket.
  "content/heading-structure":{ baseImpact: 5,  perInstance: 1,  maxImpact: 20 },
  "content/image-alt-text":   { baseImpact: 3,  perInstance: 1,  maxImpact: 20 },
  // 2026-08-23 folklore-vs-fact batch. Every rule below is PAGE-scoped and
  // fires once per audited page, so on a templated site its count is the
  // SAMPLE SIZE, not the number of distinct defects. That is the same hazard
  // `tech/hreflang-consistency` is pinned for (see its note): 350 findings
  // from one missing reciprocal pair is not 350x the impact. Where one
  // template edit fixes every finding, `perInstance` is 0 and the cap equals
  // the base, so the rule contributes what the single defect is worth.
  //
  // Both signals (missing width/height, no srcset) come from one template's
  // <img> markup, and both are page-experience RECOMMENDATIONS, not crawl or
  // index requirements. The CLS outcome they predict is already measured
  // directly by tech/core-web-vitals, so scaling this per page would
  // double-count the cause and the effect.
  "content/image-attributes": { baseImpact: 4,  perInstance: 0,  maxImpact: 4  },
  // Google composes a snippet when the description is absent, so this costs
  // control of the SERP pitch, not indexing. One template binding emits (or
  // fails to emit) the tag for the whole cluster: one defect, one fix.
  "content/meta-description-presence": { baseImpact: 5, perInstance: 0, maxImpact: 5 },
  // Citation coverage is low-confidence (block-level grounded-claim heuristic);
  // keep its impact modest so it nudges rather than dominates the score.
  "content/citation-coverage":{ baseImpact: 3,  perInstance: 1,  maxImpact: 15 },
  "content/translation-no-op":{ baseImpact: 30, perInstance: 10, maxImpact: 60 },
  // v1 warning-severity heuristic; lower than translation-no-op since it's speculative
  "content/regurgitated-content": { baseImpact: 15, perInstance: 5, maxImpact: 35 },
  // v0.5.11 warning/low-confidence cliché density detector; lower than regurgitated-content
  "content/common-phrase-reuse":  { baseImpact: 12, perInstance: 4, maxImpact: 30 },
  // v0.5.14 speculative/warning Wikipedia trigram overlap; lower than common-phrase-reuse
  "content/wikipedia-paraphrase": { baseImpact: 10, perInstance: 3, maxImpact: 25 },
  // v0.5.8 composite per-page quality synthesis
  "content/value-add":            { baseImpact: 25, perInstance: 8, maxImpact: 50 },

  // Tech: softened in v0.4.3-rc2 after dogfood showed nextjs.org regressing
  // from ready→caution on tech/canonical-consistency × 4 (legit cross-domain
  // canonicals on a CDN). Per-instance now 1 (was 3).
  "tech/canonical-consistency":          { baseImpact: 8,  perInstance: 1, maxImpact: 25 },
  "tech/canonical-noindex-conflict":     { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "tech/robots-noindex-conflict":        { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "tech/redirect-chain":                 { baseImpact: 5,  perInstance: 1, maxImpact: 25 },
  "tech/sitemap-completeness":           { baseImpact: 8,  perInstance: 1, maxImpact: 30 },
  "tech/robots-sitemap-presence":        { baseImpact: 8,  perInstance: 0, maxImpact: 8 },
  "tech/soft-404":                       { baseImpact: 6,  perInstance: 1, maxImpact: 30 },
  // hreflang: one bad declaration breaks all language pairs, so the COUNT
  // doesn't compound. perInstance: 0 keeps it at the base impact regardless
  // of how many language pairs are affected. Dogfood showed 350 findings on
  // stripe.com from a single missing reciprocal pair; that should not be
  // treated as 350× the impact.
  "tech/hreflang-consistency":           { baseImpact: 5,  perInstance: 0, maxImpact: 5  },
  "tech/og-completeness":                { baseImpact: 4,  perInstance: 1, maxImpact: 20 },
  "tech/core-web-vitals":                { baseImpact: 5,  perInstance: 1, maxImpact: 25 },
  // Same code-value surface as tech/hreflang-consistency, split out only so the
  // two checks stay separable; an invalid code lives in one shared <head>
  // alternates block and is silently ignored by Google on every page that
  // repeats it. Pinned identically to its sibling for the same reason.
  "tech/hreflang-validity":              { baseImpact: 5,  perInstance: 0, maxImpact: 5  },
  // The only rule in this batch whose count is genuinely per-page: each page
  // past the 2 MB per-file cutoff loses its OWN content, links and JSON-LD, so
  // a second oversized page is a second set of invisible content. Modest
  // scaling, cap in line with tech/sitemap-completeness.
  "tech/html-size":                      { baseImpact: 8,  perInstance: 1, maxImpact: 25 },
  // Dominant firing is the `info` half (html lang absent), and the rule's own
  // docstring records that Google IGNORES the lang attribute for ranking, so
  // it must not accumulate. The `error` half (body script contradicts every
  // declared language) is genuinely serious, but it fires at error severity
  // and so already reaches the verdict through the blocker-density floor; the
  // impact table must not charge for it a second time. lang comes from one
  // layout, so perInstance 0.
  "tech/language-mismatch":              { baseImpact: 6,  perInstance: 0, maxImpact: 6  },
  // A real contradiction deindexes the page (most restrictive directive wins),
  // which is the most consequential finding in this batch. But the conflict is
  // one misconfiguration - typically a single CDN X-Robots-Tag against a
  // template's meta tag - so the count is the sample size. Base above its
  // siblings tech/canonical-noindex-conflict and tech/robots-noindex-conflict
  // because the outcome is deterministic rather than probable; per-instance
  // kept to 1 so widespread conflicts still read worse than a single page.
  "tech/meta-robots-conflict":           { baseImpact: 12, perInstance: 1, maxImpact: 20 },
  // Companion to tech/html-size for subresources - and the same bundle.js is
  // counted once per page that loads it, so the count multiplies ONE truncated
  // file by the sample size. The rule also documents that its byte totals are
  // floors (cross-origin assets report 0) and that it never escalates on the
  // total alone, so it should nudge, not accumulate.
  "tech/resource-weight":                { baseImpact: 6,  perInstance: 0, maxImpact: 6  },
  // Corpus-scoped: one robots.txt per site, at most two distinct defects (past
  // the 500 KiB parse limit; unsupported directives). Each is a real, separate
  // problem, so a small per-instance step is honest and the cap is naturally low.
  "tech/robots-txt-limits":              { baseImpact: 5,  perInstance: 2, maxImpact: 10 },
  // Emits ROLLUP findings - one per issue kind, never per URL - so unlike the
  // rest of this batch the count really is a count of distinct defects
  // (foreign-host URLs, unparseable lastmod, future lastmod, generated
  // lastmod). This is the one rule in the batch that should scale.
  "tech/sitemap-hygiene":                { baseImpact: 6,  perInstance: 3, maxImpact: 20 },
  // The `warning` half (nosnippet / max-snippet:0) is a real self-inflicted
  // wound: it also removes AI Overview and answer-engine eligibility. The
  // `info` half (data-nosnippet attributes) is explicitly "surfaced, not
  // judged" per the rule's docstring, and is the half that actually fires at
  // scale, from one shared component. One directive, one fix: perInstance 0.
  "tech/snippet-suppression":            { baseImpact: 6,  perInstance: 0, maxImpact: 6  },
  // A missing viewport is one line in one base layout. Real - Google indexes
  // mobile-first and Lighthouse's SEO audit requires the tag - but it degrades
  // page experience rather than blocking crawl or indexing, and N pages
  // missing it is the same single missing line.
  "tech/viewport-meta":                  { baseImpact: 6,  perInstance: 0, maxImpact: 6  },
  // Fires once per page whose content or interactivity exists only after
  // hydration. Whether a route server-renders is decided by ONE rendering
  // configuration, so every page built from the same entry point bails out
  // together and one fix clears them all: perInstance 0. Base above the
  // page-experience rules around it because the consequence is that Google's
  // first pass sees an empty shell, which reads as thin or duplicate; below
  // tech/meta-robots-conflict, whose outcome (deindexing) is deterministic.
  "tech/csr-bailout":                    { baseImpact: 10, perInstance: 0, maxImpact: 10 },
  // A sitemap URL that robots.txt disallows is a contradiction: the site asks
  // Google to index a page it also refuses to let Google crawl. Real, and
  // `error` severity - but the defect is ONE Disallow pattern (the rule stops
  // at the first pattern that matches, one finding per page), and every page
  // under that prefix repeats it. Removing the directive, or the URLs from the
  // sitemap, fixes the whole set: perInstance 0. Base matches its siblings
  // tech/robots-noindex-conflict and tech/canonical-noindex-conflict, the
  // other index-vs-crawl contradictions.
  "tech/robots-compliance":              { baseImpact: 10, perInstance: 0, maxImpact: 10 },

  // Links
  "links/orphan-pages":        { baseImpact: 5, perInstance: 1, maxImpact: 25 },
  "links/dead-ends":           { baseImpact: 3, perInstance: 1, maxImpact: 20 },
  "links/cluster-connectivity":{ baseImpact: 5, perInstance: 1, maxImpact: 25 },
  "links/link-depth":          { baseImpact: 3, perInstance: 1, maxImpact: 20 },
  // One navigation component repeated across the cluster: 24 findings on a
  // 25-page sample is one uncrawlable <a> pattern, not 24. Pinned at the same
  // 8/0/8 as tech/robots-sitemap-presence and aeo/crawler-access, the other
  // "one site-wide crawl-access defect" rules. The downstream damage - pages
  // Google cannot reach - is already measured by links/orphan-pages and
  // links/unreachable-from-root, so scaling here would double-count it.
  "links/crawlable-anchors":   { baseImpact: 8, perInstance: 0, maxImpact: 8  },
  // Fires once per page that has inbound links but no path back to the crawl
  // root, so on a templated site the count is the size of the stranded
  // SUBTREE, not the number of defects: one nav block that stopped linking a
  // section strands every page in it (23 of 25 pages on wise.com in the
  // calibration corpus, from one such nav). The rule also refuses to run at
  // all on a sampled crawl, because there the count is an artifact of which
  // intermediary pages we happened to fetch. Pinned at the same 8/0/8 as
  // links/crawlable-anchors and aeo/crawler-access, the other "one site-wide
  // crawl-access defect" rules; the pages-Google-cannot-reach consequence is
  // already counted by links/orphan-pages.
  "links/unreachable-from-root": { baseImpact: 8, perInstance: 0, maxImpact: 8  },
  // info severity, medium confidence, and the rule's own docstring calls both
  // of its firing thresholds arbitrary reporting floors with no Google-
  // published equivalent. Lowest-stakes rule in the batch; a repeated
  // "Learn more" card is one template string.
  "links/generic-anchor-text": { baseImpact: 3, perInstance: 0, maxImpact: 3  },
  // host-section-divergence is a reputation/integrity-grade signal that happens
  // to live in the links namespace (it reads the link graph). It escalates to
  // `error` and maps to manual-action risk, so it gets an explicit weight rather
  // than inheriting DEFAULT_RULE_IMPACT (5/25), and is routed to the `integrity`
  // bucket via RULE_CATEGORY_OVERRIDES so the score reflects the spam-policy
  // severity rather than diluting into discoverability (0.15 weight).
  "links/host-section-divergence": { baseImpact: 15, perInstance: 5, maxImpact: 45 },

  // AEO: much lower baselines than spam (AEO is opt-in optimization)
  "aeo/citable-facts":        { baseImpact: 2,  perInstance: 1,  maxImpact: 25 },
  "aeo/answer-first":         { baseImpact: 3,  perInstance: 1,  maxImpact: 25 },
  "aeo/summary-bait":         { baseImpact: 4,  perInstance: 1,  maxImpact: 25 },
  "aeo/crawler-access":       { baseImpact: 8,  perInstance: 0,  maxImpact: 8  },
  "aeo/freshness-signals":    { baseImpact: 2,  perInstance: 1,  maxImpact: 20 },
  "aeo/llms-txt":             { baseImpact: 4,  perInstance: 0,  maxImpact: 4  },
  "aeo/faq-coverage":         { baseImpact: 2,  perInstance: 1,  maxImpact: 15 },
  "aeo/content-modularity":   { baseImpact: 2,  perInstance: 1,  maxImpact: 15 },

  // Schema
  "schema/json-ld-valid":     { baseImpact: 8,  perInstance: 2,  maxImpact: 35 },
  "schema/required-fields":   { baseImpact: 6,  perInstance: 1,  maxImpact: 30 },
  "schema/consistency":       { baseImpact: 3,  perInstance: 1,  maxImpact: 15 },

  // Data. Both ids only exist when the caller supplied a data source, so the
  // records are ground truth rather than inference: confidence is high and the
  // question is purely whether the count is a defect count.
  //
  // One finding per page whose record has fields the page never rendered. The
  // binding lives in ONE template, so the same field is missing on every page
  // built from it and the count is the sample size - the tech/hreflang-
  // consistency shape. Base in line with tech/sitemap-completeness: a field
  // that silently fails to render is a real content loss, not a nit.
  "data/missing-binding":     { baseImpact: 8,  perInstance: 0,  maxImpact: 8  },
  // Unlike its sibling this one emits ROLLUP findings - one per (field, value)
  // that repeats across more than three pages - so the count really is a count
  // of DISTINCT fields that failed to vary per page. A second frozen field is a
  // second defect, so it scales. Pinned alongside content/meta-uniqueness, the
  // rule that measures the same failure on the rendered side.
  "data/identical-across-pages": { baseImpact: 8, perInstance: 2, maxImpact: 30 },
};

export const DEFAULT_RULE_IMPACT: RuleImpact = { baseImpact: 5, perInstance: 1, maxImpact: 25 };

/**
 * v0.4.3: confidence-based discount applied to each finding's impact.
 * Low-confidence findings contribute less to the bucket so they don't
 * inflate the verdict on site types where they false-positive.
 */
export const CONFIDENCE_MULTIPLIER: Record<Confidence, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
  speculative: 0.1,
};


/** Verdict ladder thresholds; see spec §4.4. */
export function verdictForRisk(risk: number): Verdict {
  if (risk <= 20) return "ready";
  if (risk <= 40) return "caution";
  if (risk <= 60) return "concerning";
  return "critical";
}

export function gradeForPenalty(penalty: number): Grade {
  if (penalty <= 20) return "A";
  if (penalty <= 40) return "B";
  if (penalty <= 60) return "C";
  if (penalty <= 80) return "D";
  return "F";
}

/**
 * Instance count for a finding row after enrichment.
 * - cluster → context.clusterSize (pairwise collapse)
 * - group → context.size (unique-value / orphans rollup)
 * - else → 1
 */
export function instancesForFinding(f: RuleResult): number {
  if (f.context?.type === "cluster") return f.context.clusterSize;
  if (f.context?.type === "group") return f.context.size;
  return 1;
}

export interface ScoreOutput {
  /** v0.4 internal numeric risk (0–100, low=good). Used for thresholding logic only. */
  risk: number;
  /** v0.4 four-bucket categories with grades. */
  categories: CategoryGrades;
  /** Counts per issue bucket, for the verdict headline. */
  bucketCounts: { blockers: number; shouldFix: number; informational: number };
}

/**
 * v0.4.3: confidence-and-count-aware scoring. Replaces the v0.4 model that
 * counted only severity. Each rule has a `baseImpact + (count - 1) *
 * perInstance` contribution capped by `maxImpact`. The result is multiplied
 * by the finding's `confidence` (default `high` → 1.0). Per-site-type
 * profiles can remap a rule's severity / confidence; this function expects
 * those overrides to ALREADY be applied to the input findings.
 *
 * Instance count: sum of `instancesForFinding` across a ruleId group (not
 * `group.length`), so a 40-page cluster scores as 40 instances.
 *
 * Bucket math: per-rule impacts sum into the rule's category bucket;
 * each bucket is then capped at 100 and weighted by the active scoring
 * profile's `categoryWeights`.
 */
export function scoreFromFindings(
  findings: RuleResult[],
  classification: SiteClassification | undefined,
  pageCount = 0,
): ScoreOutput {
  const profile = profileFor(classification);

  const bucketRaw: Record<CategoryKey, number> = {
    integrity: 0,
    discoverability: 0,
    citation: 0,
    data: 0,
    audit: 0,
  };
  const bucketIssues: Record<CategoryKey, number> = {
    integrity: 0,
    discoverability: 0,
    citation: 0,
    data: 0,
    audit: 0,
  };

  let blockers = 0;
  let shouldFix = 0;
  let informational = 0;

  const groups = new Map<string, RuleResult[]>();
  for (const finding of findings) {
    const bucket = categoryForRule(finding.ruleId);
    if (!bucket) continue;
    if (bucket !== "audit") bucketIssues[bucket] += 1;
    if (bucket === "audit") continue;

    const instances = instancesForFinding(finding);
    if (finding.severity === "critical" || finding.severity === "error") blockers += instances;
    else if (finding.severity === "warning") shouldFix += 1;
    else informational += 1;

    const arr = groups.get(finding.ruleId) ?? [];
    arr.push(finding);
    groups.set(finding.ruleId, arr);
  }

  // 2026-05-03 calibration credibility fix: track info-severity vs
  // non-info contributions to each bucket separately so a flood of info
  // findings can't fill the bucket cap and tank the verdict on its own.
  const bucketInfoOnly: Record<CategoryKey, number> = {
    integrity: 0, discoverability: 0, citation: 0, data: 0, audit: 0,
  };
  const bucketNonInfo: Record<CategoryKey, number> = {
    integrity: 0, discoverability: 0, citation: 0, data: 0, audit: 0,
  };

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
      const conf: Confidence = f.confidence ?? "high";
      const m = CONFIDENCE_MULTIPLIER[conf];
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

  for (const key of ["integrity", "discoverability", "citation", "data"] as CategoryKey[]) {
    const info = Math.min(50, bucketInfoOnly[key]);
    const nonInfo = Math.min(100, bucketNonInfo[key]);
    bucketRaw[key] = Math.min(100, info + nonInfo);
  }

  const cw = profile.categoryWeights;
  const weighted =
    bucketRaw.integrity * cw.integrity +
    bucketRaw.discoverability * cw.discoverability +
    bucketRaw.citation * cw.citation +
    bucketRaw.data * cw.data;

  // v0.5.3: blocker DENSITY floor.
  //   - Zapier 5 blockers / 500 pages stays valid for unclustered errors
  //   - clustered integrity must not hide behind the 1-row collapse: each
  //     error/critical finding contributes instancesForFinding(f), not 1.
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

  return {
    risk,
    categories,
    bucketCounts: { blockers, shouldFix, informational },
  };
}
