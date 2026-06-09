import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { parseHtmlPage } from "./parser.js";
import { pageSkipReason } from "./page-filter.js";
import { mergeNormalizeUrlOptions, normalizeAuditUrl } from "./url-normalize.js";
import { eeatSignalsRule } from "./rules/content/eeat-signals.js";
import { metaUniquenessRule } from "./rules/content/meta-uniqueness.js";
import { missingAuthorRule } from "./rules/content/missing-author.js";
import { uniqueValueRule } from "./rules/content/unique-value.js";
import { boilerplateRatioRule } from "./rules/spam/boilerplate-ratio.js";
import { doorwayPatternRule } from "./rules/spam/doorway-pattern.js";
import { entitySwapRule } from "./rules/spam/entity-swap.js";
import { nearDuplicateRule } from "./rules/spam/near-duplicate.js";
import { publicationVelocityRule } from "./rules/spam/publication-velocity.js";
import { templateDiversityRule } from "./rules/spam/template-diversity.js";
import { thinContentRule } from "./rules/spam/thin-content.js";
import { deadEndsRule } from "./rules/links/dead-ends.js";
import { linkDepthRule } from "./rules/links/link-depth.js";
import { clusterConnectivityRule } from "./rules/links/cluster-connectivity.js";
import { hostSectionDivergenceRule } from "./rules/links/host-section-divergence.js";
import { orphanPagesRule } from "./rules/links/orphan-pages.js";
import { ogCompletenessRule } from "./rules/tech/og-completeness.js";
import { titleUniquenessRule } from "./rules/content/title-uniqueness.js";
import { headingStructureRule } from "./rules/content/heading-structure.js";
import { imageAltTextRule } from "./rules/content/image-alt-text.js";
import { translationNoOpRule } from "./rules/content/translation-no-op.js";
import { regurgitatedContentRule } from "./rules/content/regurgitated-content.js";
import { commonPhraseReuseRule } from "./rules/content/common-phrase-reuse.js";
import { wikipediaParaphraseRule } from "./rules/content/wikipedia-paraphrase.js";
import { valueAddRule } from "./rules/content/value-add.js";
import { canonicalConsistencyRule } from "./rules/tech/canonical-consistency.js";
import { canonicalNoindexConflictRule } from "./rules/tech/canonical-noindex-conflict.js";
import { hreflangConsistencyRule } from "./rules/tech/hreflang-consistency.js";
import { robotsNoindexConflictRule } from "./rules/tech/robots-noindex-conflict.js";
import { sitemapCompletenessRule } from "./rules/tech/sitemap-completeness.js";
import { robotsComplianceRule, parseDisallowPatterns, isBlockedByPattern, parseCrawlDelaySeconds, parseSitemapDirectives } from "./rules/tech/robots-sitemap-presence.js";
import { llmsTxtRule } from "./rules/aeo/llms-txt.js";
import { crawlerAccessRule } from "./rules/aeo/crawler-access.js";
import { freshnessSignalsRule } from "./rules/aeo/freshness-signals.js";
import { faqCoverageRule } from "./rules/aeo/faq-coverage.js";
import { answerFirstRule } from "./rules/aeo/answer-first.js";
import { citableFactsRule } from "./rules/aeo/citable-facts.js";
import { contentModularityRule } from "./rules/aeo/content-modularity.js";
import { summaryBaitRule } from "./rules/aeo/summary-bait.js";
import { redirectChainRule } from "./rules/tech/redirect-chain.js";
import { soft404Rule } from "./rules/tech/soft-404.js";
import { jsonLdValidRule } from "./rules/schema/json-ld-valid.js";
import { requiredFieldsRule } from "./rules/schema/required-fields.js";
import { schemaConsistencyRule } from "./rules/schema/consistency.js";
import { urlPatternRule } from "./rules/cannibal/url-pattern.js";
import { templateCoverageRule } from "./rules/spam/template-coverage.js";
import { dataBindingRule, dataIdenticalRule } from "./rules/data/data-binding.js";
import { classifyPages, isRuleEnabled } from "./page-classifier.js";
import { isRuleAllowedInDiff } from "./rules/scope.js";
import { RULE_REFERENCES } from "./rule-references.js";
import { enrichFindings } from "./enrich-findings.js";
import { triageFindings } from "./ai/triage.js";
import { createLanguageModel } from "./ai/adapters/index.js";
import { promptTriageFeedback } from "./ai/feedback-prompt.js";
import {
  generateRunId,
  appendTelemetryRecord,
  todayTriageSpendUsd,
  type AuditRecord,
  type FeedbackRecord,
} from "./telemetry/index.js";
import type {
  AuditOptions,
  AuditSummary,
  CacheStats,
  CategoryGrades,
  CategoryKey,
  Confidence,
  CrawlStats,
  EntityMaskPattern,
  FindingContext,
  FixEffort,
  Grade,
  IssueBuckets,
  NormalizeUrlOptions,
  ParsedPage,
  RuleResult,
  Severity,
  Template,
  Verdict,
} from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { cachedFetch, pruneCache, type CacheConfig } from "./cache.js";
import { SSRFError, validateTargetHost } from "./ssrf-guard.js";
import { SAFE_MODE_PRESETS, resolveSafeModeKey } from "./safe-mode-preset.js";
import { FetchObserver, computeReadiness, detectDevServer, type DetectedFramework, type FetchObservation } from "./fetch-observer.js";
import { BackpressureMonitor, OriginDegradedError } from "./backpressure.js";
import { stratifiedSample, mulberry32 } from "./stratified-sample.js";
import { classifySite, applyDegenerationGuard, corpusStatsFromPages, type SiteClassification, type SiteType } from "./site-classifier.js";
import {
  readState, writeState, computeContentHash, STATE_SCHEMA_VERSION,
  type RunState, type RenderMode, type UrlStateEntry,
} from "./state.js";
import { CORE_RULESET_VERSION } from "./ruleset-version.js";
import { planScrapeStrategy, DEFAULT_AGE_FLOOR_DAYS, type ScrapePlan } from "./scrape-strategy.js";
import { detectTemplates, buildUrlToTemplateMap, shouldActivateTemplateScoring } from "./template-detection.js";
import { scoreTemplates, siteVerdictFromTemplates } from "./per-template-scoring.js";

const DEFAULTS = {
  nearDuplicateThreshold: 0.85,
  entitySwapThreshold: 0.95,
  thinContentMinWords: 300,
  publicationVelocityMaxPerDay: 100,
  publicationVelocityMaxPerDayCorpusFraction: 0.10,
  boilerplateMaxRatio: 0.7,
  templateDiversityMinUniqueRatio: 0.35,
  uniqueValueMinWords: 100,
  metaUniquenessMinJaccard: 0.9,
  linkDepthMaxClicks: 3,
  templateCoverageMinPages: 5,
  answerFirstMaxWords: 100,
  citableFactsMin: 3,
  citableFactsTarget: 8,
  freshnessMaxStaleDays: 180,
  modularityMaxParagraphWords: 200,
  modularityMinSelfContainedRatio: 0.7,
  faqMinQuestionHeadings: 2
} as const;

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
 * Per-rule category overrides — take precedence over the namespace-level
 * CATEGORY_MAP. A rule lands here when its namespace (chosen for code
 * organisation) doesn't match the scoring bucket its *signal* belongs to.
 *
 * `links/host-section-divergence` lives in the links namespace because it reads
 * the internal-link graph, but semantically it detects a spam-policy violation
 * (Google's May 2024 site-reputation-abuse) — an INTEGRITY signal, not a
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
 * v0.4.3 — site-type-aware scoring profile. Each profile defines:
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
 * defaults — never demote findings on a site we can't confidently classify.
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
      // (catalog records are thin + entity-swap by design — not actually a
      // doorway funnel). The classifier mistakes catalog directories as
      // small-marketing; this demotion absorbs that mis-classification
      // without weakening detection on actual small-marketing sites
      // (linear.app, supabase.com — none of which produce entity-swap pairs).
      "spam/doorway-pattern":   "warning",
      // 2026-05-03 calibration round 4: spam/boilerplate-ratio fired ERROR
      // on Segment's integration directory (24 pages, 60%+ shared template
      // chrome). On a marketing-template site the rule is correct — repeated
      // "About us" / "Pricing" copy across pages IS a quality issue. On a
      // catalog mis-classified to small-marketing, the shared chrome IS the
      // template — by design. Demote to warning here; real marketing sites
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
    // are calibrated against — yet was the only profile with no overrides.
    //
    // Pre-calibration adjustment: demote (never escalate) the rules that
    // first-principles analysis predicts will false-positive on catalog-
    // shaped sites (Zapier integrations, G2 categories, Wise currency pairs,
    // etc.). A reputable-pSEO calibration corpus + runner has been added
    // (scripts/calibration-reputable-pseo.ts); these overrides will be
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
      // signal but cap at warning — never error.
      "spam/template-diversity": "warning",
      // 2026-05-03 v0.5.2 round 10: same catalog logic as small-marketing.
      "tech/og-completeness":      "info",
      "content/heading-structure": "info",
      "content/image-alt-text":    "info",
      // 2026-05-03 calibration round 2: catalogs are near-duplicate by
      // design. spam/near-duplicate fires CRITICAL on every catalog pair.
      // Demote to warning — keeps the signal visible without dominating
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
      // by design — same as `spam/template-diversity`, this signal is
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
    // driver was always `aeo/citable-facts` at full error severity — but
    // catalog/template-gallery pages don't have prose, so the rule fires
    // for a STRUCTURAL reason (page is a table, not a paragraph), not a
    // QUALITY reason. Demoting the structurally-incompatible rules to
    // info on `unclear` is conservative:
    //   - if site is genuinely editorial and got mis-classified, signals
    //     still surface (just info, not error) — author can act on them.
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
      // connectors directory — invisible per-rule but cumulatively pushing
      // the score over 'caution'. On unclear sites we cannot tell whether
      // these triple-fires represent a real doorway or a catalog; the
      // calibration corpus shows reputable catalogs hitting them more
      // often than real doorways do. Demote to warning — keeps the signal
      // visible (it appears in shouldFix bucket, with full message) without
      // tanking the verdict on a structurally-ambiguous site.
      "spam/near-duplicate":    "warning",
      "spam/entity-swap":       "warning",
      "spam/doorway-pattern":   "warning",
      // 2026-05-03 calibration round 4: same boilerplate logic on unclear —
      // we can't tell whether the site is a marketing site (boilerplate IS
      // a quality issue) or a catalog (it isn't), so demote conservatively.
      "spam/boilerplate-ratio": "warning",
      // 2026-05-03 calibration round 5: same thin-content logic on unclear.
      // Catalog-shape sites that classify as unclear (Zapier, Typeform,
      // Jasper) had thin-content firing at error on the 5-15% of pages
      // shorter than the 300-word default. Demote to info — surfaces the
      // signal without driving the verdict on a structurally-ambiguous site.
      "spam/thin-content":      "info",
      // 2026-05-03 v0.5.2 round 10: same demotions as programmatic-
      // directory profile — these tipped Webflow/Zapier/Numbeo/Airbyte
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
 * v0.5.3 — when `applyDegenerationGuard` has tripped, we return a synthetic
 * profile that reuses `unclear` category weights but applies NO severity /
 * confidence overrides. The whole point of the guard is to expose the
 * natural rule severities on degenerate corpora; the demotion table on
 * `unclear` would re-mask `spam/thin-content` and `aeo/citable-facts` if we
 * just used SCORING_PROFILES.unclear here.
 */
function profileFor(classification: SiteClassification | undefined): ScoringProfile {
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
 * v0.4.3 — per-rule impact model. Replaces flat severity weights so a single
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
interface RuleImpact {
  /** First-occurrence penalty. */
  baseImpact: number;
  /** Per-additional-instance penalty (capped — see below). */
  perInstance: number;
  /** Hard cap on per-rule contribution (so no single rule can dominate). */
  maxImpact?: number;
}

const RULE_IMPACTS: Record<string, RuleImpact> = {
  // SpamBrain — high baseline, count amplifies (cluster matters)
  "spam/near-duplicate":      { baseImpact: 25, perInstance: 5,  maxImpact: 80 },
  "spam/entity-swap":         { baseImpact: 25, perInstance: 5,  maxImpact: 80 },
  "spam/doorway-pattern":     { baseImpact: 30, perInstance: 0,  maxImpact: 30 },
  "spam/template-coverage":   { baseImpact: 15, perInstance: 3,  maxImpact: 60 },
  "spam/template-diversity":  { baseImpact: 12, perInstance: 3,  maxImpact: 50 },
  "spam/boilerplate-ratio":   { baseImpact: 10, perInstance: 2,  maxImpact: 40 },
  "spam/thin-content":        { baseImpact: 8,  perInstance: 2,  maxImpact: 40 },
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
  "content/translation-no-op":{ baseImpact: 30, perInstance: 10, maxImpact: 60 },
  // v1 warning-severity heuristic; lower than translation-no-op since it's speculative
  "content/regurgitated-content": { baseImpact: 15, perInstance: 5, maxImpact: 35 },
  // v0.5.11 warning/low-confidence cliché density detector; lower than regurgitated-content
  "content/common-phrase-reuse":  { baseImpact: 12, perInstance: 4, maxImpact: 30 },
  // v0.5.14 speculative/warning Wikipedia trigram overlap; lower than common-phrase-reuse
  "content/wikipedia-paraphrase": { baseImpact: 10, perInstance: 3, maxImpact: 25 },
  // v0.5.8 composite per-page quality synthesis
  "content/value-add":            { baseImpact: 25, perInstance: 8, maxImpact: 50 },

  // Tech — softened in v0.4.3-rc2 after dogfood showed nextjs.org regressing
  // from ready→caution on tech/canonical-consistency × 4 (legit cross-domain
  // canonicals on a CDN). Per-instance now 1 (was 3).
  "tech/canonical-consistency":          { baseImpact: 8,  perInstance: 1, maxImpact: 25 },
  "tech/canonical-noindex-conflict":     { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "tech/robots-noindex-conflict":        { baseImpact: 10, perInstance: 2, maxImpact: 40 },
  "tech/redirect-chain":                 { baseImpact: 5,  perInstance: 1, maxImpact: 25 },
  "tech/sitemap-completeness":           { baseImpact: 8,  perInstance: 1, maxImpact: 30 },
  "tech/robots-sitemap-presence":        { baseImpact: 8,  perInstance: 0, maxImpact: 8 },
  "tech/soft-404":                       { baseImpact: 6,  perInstance: 1, maxImpact: 30 },
  // hreflang — one bad declaration breaks all language pairs, so the COUNT
  // doesn't compound. perInstance: 0 keeps it at the base impact regardless
  // of how many language pairs are affected. Dogfood showed 350 findings on
  // stripe.com from a single missing reciprocal pair — that should not be
  // treated as 350× the impact.
  "tech/hreflang-consistency":           { baseImpact: 5,  perInstance: 0, maxImpact: 5  },
  "tech/og-completeness":                { baseImpact: 4,  perInstance: 1, maxImpact: 20 },

  // Links
  "links/orphan-pages":        { baseImpact: 5, perInstance: 1, maxImpact: 25 },
  "links/dead-ends":           { baseImpact: 3, perInstance: 1, maxImpact: 20 },
  "links/cluster-connectivity":{ baseImpact: 5, perInstance: 1, maxImpact: 25 },
  "links/link-depth":          { baseImpact: 3, perInstance: 1, maxImpact: 20 },
  // host-section-divergence is a reputation/integrity-grade signal that happens
  // to live in the links namespace (it reads the link graph). It escalates to
  // `error` and maps to manual-action risk, so it gets an explicit weight rather
  // than inheriting DEFAULT_RULE_IMPACT (5/25), and is routed to the `integrity`
  // bucket via RULE_CATEGORY_OVERRIDES so the score reflects the spam-policy
  // severity rather than diluting into discoverability (0.15 weight).
  "links/host-section-divergence": { baseImpact: 15, perInstance: 5, maxImpact: 45 },

  // AEO — much lower baselines than spam (AEO is opt-in optimization)
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

  // Data
  "data/data-binding":        { baseImpact: 6,  perInstance: 1,  maxImpact: 30 },
};

const DEFAULT_RULE_IMPACT: RuleImpact = { baseImpact: 5, perInstance: 1, maxImpact: 25 };

/**
 * v0.4.3 — confidence-based discount applied to each finding's impact.
 * Low-confidence findings contribute less to the bucket so they don't
 * inflate the verdict on site types where they false-positive.
 */
const CONFIDENCE_MULTIPLIER: Record<Confidence, number> = {
  high: 1.0,
  medium: 0.6,
  low: 0.3,
  speculative: 0.1,
};

/** Slug map for `RuleResult.docsUrl`. Defaults to the rule-id segment after the `/`. */
const RULE_DOCS_SLUG: Record<string, string> = {
  // intentionally empty for v0.4 — slug = ruleId.split("/").pop() works for every shipped rule
};

function docsUrlFor(ruleId: string): string {
  const slug = RULE_DOCS_SLUG[ruleId] ?? ruleId.split("/").pop() ?? ruleId;
  return `https://pseolint.dev/rules/${slug}`;
}

/** Verdict ladder thresholds — see spec §4.4. */
function verdictForRisk(risk: number): Verdict {
  if (risk <= 20) return "ready";
  if (risk <= 40) return "caution";
  if (risk <= 60) return "concerning";
  return "critical";
}

/**
 * 2026-05-03 v0.5.2 — apply the bring-your-own-authority shift to the
 * verdict ladder. The raw `risk` number is unchanged; only the user-
 * facing verdict mapping shifts.
 *
 *   `authorityScore >= 80` (established brand)  → shift ONE TIER LENIENT
 *   `authorityScore <= 30` (newer/lower)        → shift ONE TIER STRICT
 *   31..79 or undefined                          → no shift
 *
 * "One tier lenient" means: critical → concerning, concerning → caution,
 * caution → ready, ready → ready (clamped). "One tier strict" is the
 * inverse direction: ready → caution, caution → concerning,
 * concerning → critical, critical → critical.
 */
const VERDICT_LADDER: Verdict[] = ["ready", "caution", "concerning", "critical"];

function shiftVerdictForAuthority(verdict: Verdict, authorityScore: number | undefined): Verdict {
  if (authorityScore === undefined) return verdict;
  if (!Number.isFinite(authorityScore)) return verdict;
  if (authorityScore < 0 || authorityScore > 100) return verdict;
  const idx = VERDICT_LADDER.indexOf(verdict);
  if (idx < 0) return verdict;
  if (authorityScore >= 80) {
    return VERDICT_LADDER[Math.max(0, idx - 1)];
  }
  if (authorityScore <= 30) {
    return VERDICT_LADDER[Math.min(VERDICT_LADDER.length - 1, idx + 1)];
  }
  return verdict;
}

function gradeForPenalty(penalty: number): Grade {
  if (penalty <= 20) return "A";
  if (penalty <= 40) return "B";
  if (penalty <= 60) return "C";
  if (penalty <= 80) return "D";
  return "F";
}

/** True for `text/html` and `application/xhtml+xml` only (treat as audit-eligible content). */
function isHtmlContentType(contentType: string | undefined): boolean {
  if (!contentType) return true; // Local files / unknown — assume HTML.
  const lower = contentType.toLowerCase();
  return lower.includes("text/html") || lower.includes("application/xhtml+xml");
}

/** Glob match against a URL pathname only (not the full URL). v0.4 spec §4.5. */
function globMatchPathname(pattern: string, urlOrPath: string): boolean {
  let pathname: string;
  try {
    pathname = new URL(urlOrPath).pathname;
  } catch {
    // Not a URL — treat as already-a-path. Force a leading slash for consistency.
    pathname = urlOrPath.startsWith("/") ? urlOrPath : `/${urlOrPath}`;
  }
  // Allow patterns that don't begin with "/" by normalising both sides.
  const normPattern = pattern.startsWith("/") || pattern.startsWith("*") ? pattern : `/${pattern}`;
  return matchGlob(normPattern, pathname) || matchGlob(pattern, pathname);
}

const DEFAULT_ENTITY_PATTERNS: EntityMaskPattern[] = [
  {
    placeholder: "[STATE]",
    pattern:
      /\b(Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)\b/gi
  },
  { placeholder: "[ZIP]", pattern: /\b\d{5}\b/g }
];

function resolveGroupRules(
  baseRules: Record<string, unknown>,
  overrides?: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  if (!overrides) return baseRules;
  const result = { ...baseRules };
  for (const [, values] of Object.entries(overrides)) {
    for (const [key, value] of Object.entries(values)) {
      if (key in result) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}

function runRulesOnPages(
  pages: ParsedPage[],
  /**
   * Full set of parsed pages including those filtered out by `respectNoindex`
   * / `skipDetectedAuth`. Defaults to `pages` for backwards compat. The two
   * noindex-conflict rules (`tech/canonical-noindex-conflict`,
   * `tech/robots-noindex-conflict`) read this list specifically — without it,
   * `respectNoindex: true` would hide noindex'd pages from the very rules
   * designed to flag accidental noindex'ing.
   */
  noindexAwarePages: ParsedPage[],
  resolvedRules: {
    nearDuplicateThreshold: number;
    entitySwapThreshold: number;
    thinContentMinWords: number;
    publicationVelocityMaxPerDay: number;
    publicationVelocityMaxPerDayCorpusFraction: number;
    boilerplateMaxRatio: number;
    templateDiversityMinUniqueRatio: number;
    uniqueValueMinWords: number;
    metaUniquenessMinJaccard: number;
    linkDepthMaxClicks: number;
    templateCoverageMinPages: number;
    answerFirstMaxWords: number;
    citableFactsMin: number;
    citableFactsTarget: number;
    freshnessMaxStaleDays: number;
    modularityMaxParagraphWords: number;
    modularityMinSelfContainedRatio: number;
    faqMinQuestionHeadings: number;
  },
  isEnabled: (ruleId: string) => boolean,
  groupName: string,
  knownUrls: Set<string>,
  adjacency: Map<string, Set<string>>,
  inbound: Map<string, number>,
  rootUrl: string,
  normalizeUrlOptions: NormalizeUrlOptions,
  source: string,
  entityPatterns: EntityMaskPattern[],
  overrides?: Record<string, Record<string, unknown>>,
  mode: "full" | "diff" = "full",
  /**
   * 2026-05-03 calibration credibility fix: signals that the audit is
   * running on a sampled subset of the discovered URLs. Rules whose
   * outputs depend on a complete link graph (`links/unreachable-from-
   * root`) skip their checks when this is true to avoid sampling-
   * artifact false positives.
   */
  sampled = false,
): RuleResult[] {
  const findings: RuleResult[] = [];
  const modeOk = (ruleId: string) => mode !== "diff" || isRuleAllowedInDiff(ruleId);

  const tag = (results: RuleResult[]): RuleResult[] =>
    results.map((r) => {
      const override = overrides?.[r.ruleId];
      return {
        ...r,
        group: groupName === "__default" ? undefined : groupName,
        ref: r.ref ?? RULE_REFERENCES[r.ruleId],
        ...(override?.severity ? { severity: override.severity as Severity } : {}),
      };
    });

  // Spam rules — always compute cross-page data, only push findings if enabled
  const nearDuplicate = nearDuplicateRule(pages, resolvedRules.nearDuplicateThreshold);
  if (isEnabled("spam/near-duplicate") && modeOk("spam/near-duplicate")) {
    pushAll(findings, tag(nearDuplicate.findings));
  }

  const entitySwap = entitySwapRule(pages, entityPatterns, resolvedRules.entitySwapThreshold);
  if (isEnabled("spam/entity-swap") && modeOk("spam/entity-swap")) {
    pushAll(findings, tag(entitySwap.findings));
  }

  const thinContent = thinContentRule(pages, resolvedRules.thinContentMinWords);
  if (isEnabled("spam/thin-content") && modeOk("spam/thin-content")) {
    pushAll(findings, tag(thinContent.findings));
  }

  if (isEnabled("spam/doorway-pattern") && modeOk("spam/doorway-pattern")) {
    pushAll(findings, tag(doorwayPatternRule(nearDuplicate.pairs, entitySwap.pairs, thinContent.thinContentUrls, pages)));
  }

  if (isEnabled("spam/publication-velocity") && modeOk("spam/publication-velocity")) {
    pushAll(findings, tag(publicationVelocityRule(
      pages,
      resolvedRules.publicationVelocityMaxPerDay,
      resolvedRules.publicationVelocityMaxPerDayCorpusFraction,
    )));
  }

  if (isEnabled("spam/boilerplate-ratio") && modeOk("spam/boilerplate-ratio")) {
    pushAll(findings, tag(boilerplateRatioRule(pages, resolvedRules.boilerplateMaxRatio)));
  }

  if (isEnabled("spam/template-diversity") && modeOk("spam/template-diversity")) {
    pushAll(findings, tag(templateDiversityRule(pages, resolvedRules.templateDiversityMinUniqueRatio)));
  }

  if (isEnabled("spam/template-coverage") && modeOk("spam/template-coverage")) {
    pushAll(findings, tag(templateCoverageRule(pages, entityPatterns, resolvedRules.templateCoverageMinPages)));
  }

  // Content rules
  if (isEnabled("content/unique-value") && modeOk("content/unique-value")) {
    pushAll(findings, tag(uniqueValueRule(pages, resolvedRules.uniqueValueMinWords)));
  }

  if (isEnabled("content/meta-uniqueness") && modeOk("content/meta-uniqueness")) {
    pushAll(findings, tag(metaUniquenessRule(pages, entityPatterns, resolvedRules.metaUniquenessMinJaccard)));
  }

  if (isEnabled("content/missing-author") && modeOk("content/missing-author")) {
    pushAll(findings, tag(missingAuthorRule(pages)));
  }

  if (isEnabled("content/eeat-signals") && modeOk("content/eeat-signals")) {
    pushAll(findings, tag(eeatSignalsRule(pages)));
  }

  // 2026-05-03 v0.5.2 blind-spot fixes — title uniqueness + heading
  // structure + image alt-text were tier-1 gaps in the blind-spot audit.
  if (isEnabled("content/title-uniqueness") && modeOk("content/title-uniqueness")) {
    pushAll(findings, tag(titleUniquenessRule(pages)));
  }
  if (isEnabled("content/heading-structure") && modeOk("content/heading-structure")) {
    pushAll(findings, tag(headingStructureRule(pages)));
  }
  if (isEnabled("content/image-alt-text") && modeOk("content/image-alt-text")) {
    pushAll(findings, tag(imageAltTextRule(pages)));
  }
  if (isEnabled("content/translation-no-op") && modeOk("content/translation-no-op")) {
    pushAll(findings, tag(translationNoOpRule(pages)));
  }
  if (isEnabled("content/regurgitated-content") && modeOk("content/regurgitated-content")) {
    pushAll(findings, tag(regurgitatedContentRule(pages)));
  }
  if (isEnabled("content/common-phrase-reuse") && modeOk("content/common-phrase-reuse")) {
    pushAll(findings, tag(commonPhraseReuseRule(pages)));
  }
  if (isEnabled("content/wikipedia-paraphrase") && modeOk("content/wikipedia-paraphrase")) {
    pushAll(findings, tag(wikipediaParaphraseRule(pages)));
  }

  // Link rules — use the global link graph
  if (isEnabled("links/orphan-pages") && modeOk("links/orphan-pages")) {
    pushAll(findings, tag(orphanPagesRule(pages, inbound, rootUrl)));
  }

  if (isEnabled("links/dead-ends") && modeOk("links/dead-ends")) {
    pushAll(findings, tag(deadEndsRule(pages, knownUrls, rootUrl)));
  }

  if (isEnabled("links/link-depth") && modeOk("links/link-depth")) {
    if (rootUrl) {
      pushAll(findings, tag(linkDepthRule(pages, adjacency, rootUrl, resolvedRules.linkDepthMaxClicks, inbound, sampled)));
    }
  }

  if (isEnabled("links/cluster-connectivity") && modeOk("links/cluster-connectivity")) {
    pushAll(findings, tag(clusterConnectivityRule(pages, knownUrls)));
  }

  if (isEnabled("links/host-section-divergence") && modeOk("links/host-section-divergence")) {
    pushAll(findings, tag(hostSectionDivergenceRule(pages, adjacency)));
  }

  // Tech rules
  if (isEnabled("tech/canonical-consistency") && modeOk("tech/canonical-consistency")) {
    pushAll(findings, tag(canonicalConsistencyRule(pages, knownUrls, normalizeUrlOptions)));
  }

  if (isEnabled("tech/canonical-noindex-conflict") && modeOk("tech/canonical-noindex-conflict")) {
    pushAll(findings, tag(canonicalNoindexConflictRule(noindexAwarePages, normalizeUrlOptions)));
  }

  if (isEnabled("tech/robots-noindex-conflict") && modeOk("tech/robots-noindex-conflict")) {
    pushAll(findings, tag(robotsNoindexConflictRule(noindexAwarePages, inbound)));
  }

  if (isEnabled("tech/redirect-chain") && modeOk("tech/redirect-chain")) {
    pushAll(findings, tag(redirectChainRule(pages)));
  }

  if (isEnabled("tech/soft-404") && modeOk("tech/soft-404")) {
    pushAll(findings, tag(soft404Rule(pages)));
  }

  if (isEnabled("tech/hreflang-consistency") && modeOk("tech/hreflang-consistency")) {
    // hreflang declarations on noindex'd pages are still bugs when they're
    // inconsistent — see auditor.test.ts "emits technical SEO findings".
    pushAll(findings, tag(hreflangConsistencyRule(noindexAwarePages, normalizeUrlOptions)));
  }

  // 2026-05-03 v0.5.2 blind-spot fix: og-completeness was referenced in
  // the v0.4.x README without ever shipping. Now it does.
  if (isEnabled("tech/og-completeness") && modeOk("tech/og-completeness")) {
    pushAll(findings, tag(ogCompletenessRule(pages)));
  }

  // Schema rules
  if (isEnabled("schema/json-ld-valid") && modeOk("schema/json-ld-valid")) {
    pushAll(findings, tag(jsonLdValidRule(pages)));
  }

  if (isEnabled("schema/required-fields") && modeOk("schema/required-fields")) {
    pushAll(findings, tag(requiredFieldsRule(pages)));
  }

  if (isEnabled("schema/consistency") && modeOk("schema/consistency")) {
    pushAll(findings, tag(schemaConsistencyRule(pages)));
  }

  // AEO rules
  if (isEnabled("aeo/freshness-signals")) {
    pushAll(findings, tag(freshnessSignalsRule(pages, {
      maxStaleDays: resolvedRules.freshnessMaxStaleDays,
    })));
  }

  if (isEnabled("aeo/faq-coverage")) {
    pushAll(findings, tag(faqCoverageRule(pages, {
      minQuestionHeadings: resolvedRules.faqMinQuestionHeadings,
    })));
  }

  if (isEnabled("aeo/answer-first")) {
    pushAll(findings, tag(answerFirstRule(pages, entityPatterns, {
      maxFirstParagraphWords: resolvedRules.answerFirstMaxWords,
    })));
  }

  if (isEnabled("aeo/citable-facts")) {
    pushAll(findings, tag(citableFactsRule(pages, entityPatterns, {
      minFactsPerPage: resolvedRules.citableFactsMin,
      targetFactsPerPage: resolvedRules.citableFactsTarget,
    })));
  }

  if (isEnabled("aeo/content-modularity")) {
    pushAll(findings, tag(contentModularityRule(pages, {
      maxParagraphWords: resolvedRules.modularityMaxParagraphWords,
      minSelfContainedRatio: resolvedRules.modularityMinSelfContainedRatio,
    })));
  }

  if (isEnabled("aeo/summary-bait")) {
    pushAll(findings, tag(summaryBaitRule(pages, entityPatterns)));
  }

  // Cannibal rules — only url-pattern survives in v0.4 (title-overlap and
  // keyword-collision dropped due to high false-positive rates; see
  // 2026-04-29 v0.4 redesign spec §4.3).
  if (isEnabled("cannibal/url-pattern") && modeOk("cannibal/url-pattern")) {
    pushAll(findings, tag(urlPatternRule(pages)));
  }

  return findings;
}

interface LoadedPage {
  url: string;
  html: string;
  httpMeta?: import("./types.js").HttpMeta;
}

function hashHtml(html: string): string {
  return createHash("sha256").update(html, "utf8").digest("hex");
}

interface ScoreOutput {
  /** v0.4 internal numeric risk (0–100, low=good). Used for thresholding logic only. */
  risk: number;
  /** v0.4 four-bucket categories with grades. */
  categories: CategoryGrades;
  /** Counts per issue bucket — for the verdict headline. */
  bucketCounts: { blockers: number; shouldFix: number; informational: number };
}

/**
 * v0.4.3 — apply per-site-type severity + confidence overrides BEFORE any
 * bucketing happens, so blocker/shouldFix counts and category buckets all
 * reflect the user-visible severity, not the rule's native severity.
 *
 * Returns a NEW array of findings (does not mutate the input). Only the
 * `severity` and `confidence` fields are remapped; everything else is
 * preserved by reference.
 */
export function applyScoringProfileOverrides(
  findings: RuleResult[],
  classification: SiteClassification | undefined,
): RuleResult[] {
  const profile = profileFor(classification);
  const sevHas = Object.keys(profile.severityOverrides).length > 0;
  const confHas = Object.keys(profile.confidenceOverrides).length > 0;
  if (!sevHas && !confHas) return findings;
  return findings.map((f) => {
    const newSev = profile.severityOverrides[f.ruleId];
    const newConf = profile.confidenceOverrides[f.ruleId];
    if (newSev === undefined && newConf === undefined) return f;
    return {
      ...f,
      ...(newSev !== undefined ? { severity: newSev } : {}),
      ...(newConf !== undefined ? { confidence: newConf } : {}),
    };
  });
}

/**
 * 2026-05-03 credibility: list of rule IDs that ACTUALLY had their severity
 * remapped on this audit. Distinct from `profile.severityOverrides` which is
 * the static set of demotions defined per profile — this is the subset of
 * those that actually fired. Surfaced via `summary.appliedSeverityDemotions`
 * so formatters can show the user "engine demoted X rules because <site
 * type> profile" rather than hiding the mechanism.
 */
function computeAppliedDemotions(
  findings: RuleResult[],
  classification: SiteClassification | undefined,
): string[] {
  const profile = profileFor(classification);
  if (Object.keys(profile.severityOverrides).length === 0) return [];
  const applied = new Set<string>();
  for (const f of findings) {
    if (profile.severityOverrides[f.ruleId] !== undefined) {
      applied.add(f.ruleId);
    }
  }
  return Array.from(applied).sort();
}

/**
 * v0.4.3 — confidence-and-count-aware scoring. Replaces the v0.4 model that
 * counted only severity. Each rule has a `baseImpact + (count - 1) *
 * perInstance` contribution capped by `maxImpact`. The result is multiplied
 * by the finding's `confidence` (default `high` → 1.0). Per-site-type
 * profiles can remap a rule's severity / confidence; this function expects
 * those overrides to ALREADY be applied to the input findings.
 *
 * Bucket math: per-rule impacts sum into the rule's `CATEGORY_MAP` bucket;
 * each bucket is then capped at 100 and weighted by the active scoring
 * profile's `categoryWeights`.
 */
function scoreFromFindings(
  findings: RuleResult[],
  classification: SiteClassification | undefined,
  pageCount = 0,
): ScoreOutput {
  const profile = profileFor(classification);

  // v0.4 four-bucket raw penalties.
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

  // Group findings by ruleId so we can apply baseImpact + perInstance.
  // Each group's weighted impact lands in its category bucket.
  const groups = new Map<string, RuleResult[]>();
  for (const finding of findings) {
    const bucket = categoryForRule(finding.ruleId);
    if (!bucket) continue;
    if (bucket !== "audit") bucketIssues[bucket] += 1;
    if (bucket === "audit") continue;

    if (finding.severity === "critical" || finding.severity === "error") blockers += 1;
    else if (finding.severity === "warning") shouldFix += 1;
    else informational += 1;

    const arr = groups.get(finding.ruleId) ?? [];
    arr.push(finding);
    groups.set(finding.ruleId, arr);
  }

  // 2026-05-03 calibration credibility fix: track info-severity vs
  // non-info contributions to each bucket separately so a flood of info
  // findings can't fill the bucket cap and tank the verdict on its own.
  // Round 7 surfaced this on Airbyte and round 8 on Zapier — both had
  // ALL info-severity findings in their top drivers yet scored
  // `concerning` because cumulative info impact filled the citation
  // bucket past its 100 cap. Now: info contribution per bucket caps at
  // 50; warning+ contribution caps at 100; final bucket = sum, capped
  // at 100. A site with no real warning/error findings can score at
  // most ~12.5 risk from info accumulation at typical 0.25 citation
  // weight — which keeps verdict aligned with the visible severity in
  // the report.
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
    const count = group.length;
    const rawImpact = impactSpec.baseImpact + Math.max(0, count - 1) * impactSpec.perInstance;
    const cap = impactSpec.maxImpact ?? Number.POSITIVE_INFINITY;
    const cappedImpact = Math.min(cap, rawImpact);

    // Confidence multiplier — use the WORST (highest-multiplier) confidence
    // in the group so a rule that fires repeatedly with mixed confidence is
    // not unfairly downweighted to its lowest-confidence instance.
    let bestMultiplier = 0;
    for (const f of group) {
      const conf: Confidence = f.confidence ?? "high";
      const m = CONFIDENCE_MULTIPLIER[conf];
      if (m > bestMultiplier) bestMultiplier = m;
    }
    if (bestMultiplier === 0) bestMultiplier = CONFIDENCE_MULTIPLIER.high;

    const weighted = cappedImpact * bestMultiplier;

    // Bucket the rule's contribution by the highest severity in the group.
    // Mixed-severity groups (e.g. error + info) count toward non-info — once
    // a rule has any non-info finding, its count contribution is treated as
    // a real-issue signal, not info accumulation.
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

  // v0.5.3 — blocker DENSITY floor. Category weights (e.g. small-marketing's
  // citation:0.20) can dilute hard-failed sites to A/B even when most pages
  // hit critical findings. Floor risk based on blockers-per-page so that:
  //   - small structurally-broken sites (bestfirenze: 5 blockers / 6 pages
  //     = 0.83) get pushed to D/critical regardless of category-weight dilution
  //   - large reputable directories (Zapier integrations: 5 blockers / 500
  //     pages = 0.01) are unaffected — their per-page error rate is tiny
  //     so the dilution is honest, not a scoring artifact
  // Density bands chosen to land bestfirenze at ≥60 (D) without disturbing
  // calibration corpus reputable sites at ratio < 0.05.
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

function bucketIssues(findings: RuleResult[]): IssueBuckets {
  const blockers: RuleResult[] = [];
  const shouldFix: RuleResult[] = [];
  const informational: RuleResult[] = [];
  for (const f of findings) {
    // audit/* findings are diagnostics and never appear in issue buckets.
    if (f.ruleId.startsWith("audit/")) continue;
    if (f.severity === "critical" || f.severity === "error") blockers.push(f);
    else if (f.severity === "warning") shouldFix.push(f);
    else informational.push(f);
  }
  return { blockers, shouldFix, informational };
}

function buildHeadline(counts: { blockers: number; shouldFix: number; informational: number }): string {
  const parts: string[] = [];
  if (counts.blockers > 0) {
    parts.push(`${counts.blockers} ship-blocker${counts.blockers === 1 ? "" : "s"}`);
  }
  if (counts.shouldFix > 0) {
    parts.push(`${counts.shouldFix} should-fix`);
  }
  if (counts.informational > 0 && parts.length < 2) {
    parts.push(`${counts.informational} informational`);
  }
  if (parts.length === 0) return "No issues detected.";
  return parts.join(", ");
}

/** Populate `docsUrl` on every finding that doesn't already have one. */
function withDocsUrls(findings: RuleResult[]): RuleResult[] {
  for (const f of findings) {
    if (!f.docsUrl) f.docsUrl = docsUrlFor(f.ruleId);
  }
  return findings;
}

/**
 * Append every item of `items` to `target` in place. Use this instead of
 * `target.push(...items)` whenever `items` can be large. The spread form passes
 * each element as a separate call argument, and V8 caps argument count
 * (~131072) — so `push(...bigArray)` throws `RangeError: Maximum call stack size
 * exceeded` on large inputs. A dense site makes the pairwise rules
 * (near-duplicate / entity-swap) emit C(N,2) findings, which blew the cap at the
 * rule-aggregation push *before* enrichment was even reached. The loop has no
 * such limit. See tests/integration/large-corpus-no-overflow.test.ts.
 */
function pushAll<T>(target: T[], items: readonly T[]): void {
  for (const item of items) target.push(item);
}

async function collectHtmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectHtmlFiles(fullPath);
      }
      const extension = extname(entry.name).toLowerCase();
      if (extension === ".html" || extension === ".htm") {
        return [fullPath];
      }
      return [];
    })
  );

  return files.flat();
}

/**
 * The fetch helpers all receive `stats`. To avoid threading a new
 * `onObservation` parameter through every enclosing function (sitemap walker,
 * robots.txt reader, etc.), the audit attaches the observer callback as an
 * extra property on the same `stats` object. The helpers pull it off when
 * present. Tests that synthesize a bare stats object are unaffected.
 */
type StatsWithObserver = CacheStats & { onObservation?: (obs: FetchObservation) => void };

/**
 * Combine up to N AbortSignals into one. The returned signal aborts as soon
 * as any input aborts. Avoids the node-only `AbortSignal.any` for wider
 * compatibility and keeps listeners weak-ish (one per input, no unbounded
 * listener growth).
 */
function composeSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const actual = signals.filter((s): s is AbortSignal => Boolean(s));
  if (actual.length === 0) return new AbortController().signal;
  const ac = new AbortController();
  for (const s of actual) {
    if (s.aborted) {
      ac.abort(s.reason);
      return ac.signal;
    }
    s.addEventListener("abort", () => ac.abort(s.reason), { once: true });
  }
  return ac.signal;
}

async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats,
  signal?: AbortSignal,
  validateHop?: (url: string) => Promise<void>,
  // Per-sitemap byte cap (sitemaps.org caps an uncompressed sitemap at 50 MB).
  // Guards against a hostile/misconfigured sitemap eating the whole byte budget
  // or memory. 0 / undefined = no cap.
  maxBytes?: number,
): Promise<{ text: string; contentType: string } | null> {
  try {
    stats.total += 1;
    const r = await cachedFetch(url, { timeoutMs, cache, signal, validateHop, onObservation: (stats as StatsWithObserver).onObservation });
    if (r.fromCache) {
      stats.hits += 1;
      stats.bytesSavedEstimate += r.body.length;
    }
    if (r.status < 200 || r.status >= 300) return null;
    if (maxBytes && maxBytes > 0 && r.body.length > maxBytes) {
      // eslint-disable-next-line no-console
      console.error(`pseolint: sitemap ${url} is ${(r.body.length / 1_048_576).toFixed(0)}MB, over the ${(maxBytes / 1_048_576).toFixed(0)}MB cap — skipping it.`);
      return null;
    }
    return { text: r.body, contentType: (r.headers["content-type"] ?? "").toLowerCase() };
  } catch (err) {
    if (signal?.aborted) throw err; // propagate cancellation
    return null;
  }
}

async function fetchPageWithMeta(
  url: string,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats,
  signal?: AbortSignal,
  validateHop?: (url: string) => Promise<void>,
  followRedirects: boolean = true,
): Promise<LoadedPage | null> {
  try {
    stats.total += 1;
    const r = await cachedFetch(url, { timeoutMs, cache, signal, validateHop, followRedirects, onObservation: (stats as StatsWithObserver).onObservation });
    if (r.fromCache) {
      stats.hits += 1;
      stats.bytesSavedEstimate += r.body.length;
    }
    return {
      url,
      html: r.body,
      httpMeta: {
        statusCode: r.status,
        finalUrl: r.url,
        redirectChain: r.redirectChain,
        xRobotsTag: r.headers["x-robots-tag"] ?? "",
        linkHeader: r.headers.link ?? "",
      },
    };
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

async function fetchTextStrict(
  url: string,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats,
  signal?: AbortSignal,
  validateHop?: (url: string) => Promise<void>,
): Promise<{ text: string; contentType: string }> {
  stats.total += 1;
  const r = await cachedFetch(url, { timeoutMs, cache, signal, validateHop, onObservation: (stats as StatsWithObserver).onObservation });
  if (r.fromCache) {
    stats.hits += 1;
    stats.bytesSavedEstimate += r.body.length;
  }
  if (r.status < 200 || r.status >= 300) {
    throw new Error(`Failed to fetch source: ${r.status}`);
  }
  return { text: r.body, contentType: (r.headers["content-type"] ?? "").toLowerCase() };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<unknown>
): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    while (index < items.length) {
      const current = index;
      index += 1;
      await fn(items[current]);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => next());
  await Promise.all(workers);
}

function parseSitemapUrls(xml: string): string[] {
  const matches = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi));
  return matches.map((match) => match[1]).filter(Boolean);
}

export function parseSitemapUrlsWithLastmod(xml: string): Array<{ url: string; lastmod?: string }> {
  const out: Array<{ url: string; lastmod?: string }> = [];
  // Match both <url>...</url> blocks (in <urlset>) and <sitemap>...</sitemap>
  // blocks (in <sitemapindex>). Both carry <loc> + optional <lastmod>.
  const blocks = xml.matchAll(/<(url|sitemap)\b[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const block of blocks) {
    const inner = block[2] ?? "";
    const locMatch = inner.match(/<loc\b[^>]*>([\s\S]*?)<\/loc>/i);
    if (!locMatch) continue;
    const url = locMatch[1].trim();
    if (!url) continue;
    const lastmodMatch = inner.match(/<lastmod\b[^>]*>([\s\S]*?)<\/lastmod>/i);
    const lastmod = lastmodMatch ? lastmodMatch[1].trim() : undefined;
    out.push({ url, lastmod });
  }
  return out;
}

function looksLikeSitemap(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("<urlset") || lowered.includes("<sitemapindex");
}

function looksLikeHtml(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("<html") || lowered.includes("<body") || lowered.includes("<!doctype html");
}

function isSitemapIndex(text: string): boolean {
  return text.toLowerCase().includes("<sitemapindex");
}

function matchGlob(pattern: string, value: string): boolean {
  // Iterative glob matcher — avoids dynamic RegExp to prevent ReDoS.
  // Supports ** (any path segments) and * (one path segment, no separator).
  // Normalise both sides to forward slashes so Windows paths work with
  // POSIX-style patterns like **/api/**.
  const normPattern = pattern.replace(/\\/g, "/");
  const normValue = value.replace(/\\/g, "/");

  function match(pi: number, vi: number): boolean {
    while (pi < normPattern.length) {
      if (normPattern[pi] === "*") {
        const doubleStar =
          pi + 1 < normPattern.length && normPattern[pi + 1] === "*";
        if (doubleStar) {
          pi += 2;
          // skip optional trailing separator after **
          if (pi < normPattern.length && normPattern[pi] === "/") {
            pi += 1;
          }
          if (pi === normPattern.length) return true;
          // try matching rest of pattern at every position in value
          for (let vi2 = vi; vi2 <= normValue.length; vi2 += 1) {
            if (match(pi, vi2)) return true;
          }
          return false;
        }
        // single *: match any chars except path separators
        pi += 1;
        while (vi < normValue.length && normValue[vi] !== "/") {
          vi += 1;
        }
      } else {
        if (vi >= normValue.length || normPattern[pi] !== normValue[vi]) return false;
        pi += 1;
        vi += 1;
      }
    }
    return vi === normValue.length;
  }
  return match(0, 0);
}

function shouldIgnore(url: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  // v0.4 §4.5: globs match against the URL pathname only, NOT the full URL.
  // Operator intuition: `ignore: ["dashboard/**"]` should match
  // `https://example.com/dashboard/...` even though the full URL contains the
  // host. Previously globs matched the full URL and silently failed for users
  // who didn't think to write `**/dashboard/**`.
  for (const pattern of patterns) {
    if (globMatchPathname(pattern, url)) return true;
  }
  return false;
}

function fisherYatesSample<T>(items: T[], n: number, random: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0 && arr.length - i <= n; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(arr.length - n);
}

/** sitemaps.org caps an uncompressed sitemap at 50 MB. */
const SITEMAP_MAX_BYTES = 50 * 1024 * 1024;
/**
 * Max `<sitemapindex>` nesting depth we recurse through. The protocol only
 * defines a single level of nesting, but some sites nest deeper; 5 is generous
 * while still bounding work (and stack) on a hostile/misconfigured index that a
 * `visited` set alone wouldn't catch (e.g. a deep non-cyclic chain).
 */
const SITEMAP_MAX_DEPTH = 5;

async function collectUrlsFromSitemap(
  sitemapText: string,
  sitemapUrl: string,
  visited: Set<string>,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats,
  signal?: AbortSignal,
  validateHop?: (url: string) => Promise<void>,
  depth: number = 0,
  maxDepth: number = SITEMAP_MAX_DEPTH,
): Promise<{ urls: string[]; lastmodByUrl: Map<string, string> }> {
  visited.add(sitemapUrl);
  const entries = parseSitemapUrlsWithLastmod(sitemapText);

  if (!isSitemapIndex(sitemapText)) {
    const urls: string[] = [];
    const lastmodByUrl = new Map<string, string>();
    for (const entry of entries) {
      urls.push(entry.url);
      if (entry.lastmod !== undefined) {
        lastmodByUrl.set(entry.url, entry.lastmod);
      }
    }
    return { urls, lastmodByUrl };
  }

  // It's a sitemap index. Stop recursing past the depth cap (the index itself
  // carries no page URLs, only child-sitemap refs, so returning empty is safe).
  if (depth >= maxDepth) {
    // eslint-disable-next-line no-console
    console.error(`pseolint: sitemap-index nesting exceeded depth ${maxDepth} at ${sitemapUrl}; not recursing further.`);
    return { urls: [], lastmodByUrl: new Map() };
  }

  const allUrls: string[] = [];
  const allLastmodByUrl = new Map<string, string>();
  for (const entry of entries) {
    const childUrl = entry.url;
    if (signal?.aborted) throw signal.reason ?? new Error("aborted");
    if (visited.has(childUrl)) continue;
    const child = await fetchWithRetry(childUrl, timeoutMs, cache, stats, signal, validateHop, SITEMAP_MAX_BYTES);
    if (!child) continue;
    const childLike = child.contentType.includes("xml") || looksLikeSitemap(child.text);
    if (!childLike) continue;
    const { urls: childUrls, lastmodByUrl: childLastmodByUrl } = await collectUrlsFromSitemap(child.text, childUrl, visited, timeoutMs, cache, stats, signal, validateHop, depth + 1, maxDepth);
    pushAll(allUrls, childUrls);
    for (const [u, lm] of childLastmodByUrl) {
      allLastmodByUrl.set(u, lm);
    }
  }
  return { urls: allUrls, lastmodByUrl: allLastmodByUrl };
}

async function fetchRobotsMeta(
  origin: string,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats,
  signal?: AbortSignal,
  validateHop?: (url: string) => Promise<void>,
): Promise<{ disallow: string[]; crawlDelaySec: number; sitemaps: string[] }> {
  if (!origin) return { disallow: [], crawlDelaySec: 0, sitemaps: [] };
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const fetched = await fetchTextStrict(robotsUrl, timeoutMs, cache, stats, signal, validateHop);
    // Honor both the wildcard block AND any block specifically targeting us.
    // A malicious target can't bypass our crawler by adding a targeted
    // `User-agent: pseolint / Disallow: /` without a wildcard.
    return {
      disallow: parseDisallowPatterns(fetched.text, ["*", "pseolint"]),
      crawlDelaySec: parseCrawlDelaySeconds(fetched.text),
      // `Sitemap:` directives are origin-relative-agnostic (absolute URLs) and
      // there can be several. Surfaced so discovery can read the site's declared
      // sitemaps instead of guessing.
      sitemaps: parseSitemapDirectives(fetched.text),
    };
  } catch {
    return { disallow: [], crawlDelaySec: 0, sitemaps: [] };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDisallowedByRobots(urlPath: string, patterns: string[]): boolean {
  for (const pat of patterns) {
    if (isBlockedByPattern(urlPath, pat)) return true;
  }
  return false;
}

type ByteBudget = { used: number; cap: number };

function budgetExceeded(b: ByteBudget): boolean {
  return b.cap > 0 && b.used >= b.cap;
}

/**
 * v0.5+: when present, the sitemap-source path runs the change-driven
 * monitoring decision matrix between candidate-URL discovery and body fetch.
 * URLs the matrix marks as "skip" are NOT fetched. Filesystem and single-page
 * HTML sources ignore this context (local reads are cheap; single-page
 * audits have nothing to plan).
 */
interface MonitoringContext {
  priorState: RunState;
  currentRulesetVersion: string;
  ageFloorDays: number;
  now: Date;
  /**
   * v0.5.3 — caller-supplied "watched pages" override. Any URL here is always
   * refetched (reason `"watched"`), regardless of age / ruleset / lastmod.
   * URLs absent from the sitemap are still added to the fetch set.
   */
  forceRefetchUrls?: ReadonlyArray<string>;
}

async function loadPagesFromSource(
  source: string,
  concurrency: number,
  timeoutMs: number,
  crawlDiscovery: boolean,
  discoveryBudget: number,
  cache: CacheConfig | null,
  stats: CacheStats,
  fillBudgetViaLinkDiscovery: boolean = false,
  byteBudget: ByteBudget = { used: 0, cap: 0 },
  signal?: AbortSignal,
  guardSsrf: boolean = false,
  respectRobotsTxt: boolean = true,
  skippedByRobots: string[] = [],
  followRedirects: boolean = true,
  maxCrawlDiscovered: number = 5000,
  monitoringContext: MonitoringContext | null = null,
  // Backpressure salvage: when provided, every page body that comes back is
  // pushed into this caller-owned array as it's fetched. If the watchdog aborts
  // mid-crawl and this function throws, the caller still holds the partial set
  // (the local `pages` array would otherwise be lost with the stack frame).
  pageSink?: LoadedPage[],
): Promise<{ pages: LoadedPage[]; sitemapUrls?: Set<string>; sitemapLastmodByUrl?: Map<string, string>; discoveredUrlCount?: number; scrapePlan?: ScrapePlan }> {
  // Memoized SSRF validator. When guardSsrf is on, every URL fetched by the
  // audit (source, sitemap entries, redirects, discovered links) goes through
  // this. DNS is hit once per unique hostname per audit — a 4k-page audit on
  // one origin does 1 DNS lookup, not 4k.
  const ssrfCache = new Map<string, Promise<void>>();
  const validateHop: ((u: string) => Promise<void>) | undefined = guardSsrf
    ? async (u: string) => {
      let host: string;
      try {
        host = new URL(u).hostname;
      } catch {
        throw new Error(`Refusing to fetch invalid URL: ${u}`);
      }
      let pending = ssrfCache.get(host);
      if (!pending) {
        pending = validateTargetHost(host).catch((err) => {
          if (err instanceof SSRFError) {
            throw new Error(`Refusing to fetch ${u}: ${err.reason}`);
          }
          throw err;
        });
        ssrfCache.set(host, pending);
      }
      await pending;
    }
    : undefined;

  if (/^https?:\/\//i.test(source)) {
    if (validateHop) await validateHop(source);
    let text: string;
    let contentType: string;
    let sourceStatus = 200;
    try {
      const fetched = await fetchTextStrict(source, timeoutMs, cache, stats, signal, validateHop);
      text = fetched.text;
      contentType = fetched.contentType;
    } catch {
      // Sitemap URL returned non-200 — fallback to crawl from origin homepage
      if (source.includes("sitemap")) {
        try {
          const origin = new URL(source).origin;
          const fallback = await fetchTextStrict(origin, timeoutMs, cache, stats, signal, validateHop);
          text = fallback.text;
          contentType = fallback.contentType;
          sourceStatus = -1; // flag that we fell back
        } catch {
          throw new Error(`Failed to fetch source URL: ${source} (and fallback to origin failed)`);
        }
      } else {
        throw new Error(`Failed to fetch source URL: ${source} — verify the URL is correct and returns a valid response.`);
      }
    }

    const isXml = (contentType.includes("xml") || looksLikeSitemap(text)) && sourceStatus !== -1;

    if (isXml) {
      const visited = new Set<string>();
      const { urls: allSitemapUrls, lastmodByUrl: sitemapLastmodByUrl } = await collectUrlsFromSitemap(text, source, visited, timeoutMs, cache, stats, signal, validateHop);

      // If we have a budget, sample from sitemap URLs before fetching
      const sampledUrls = discoveryBudget > 0 && allSitemapUrls.length > discoveryBudget
        ? fisherYatesSample(allSitemapUrls, discoveryBudget)
        : allSitemapUrls;

      // v0.5: change-driven monitoring. Apply the decision matrix BEFORE
      // fetching bodies. URLs in plan.skip are not network-touched at all —
      // their findings will be carried forward from prior state by the caller.
      // This is the whole point of monitoring mode: rule eval is microseconds,
      // the fetch is seconds; move the skip decision upstream of the fetch.
      let scrapePlan: ScrapePlan | undefined;
      let urlsToFetch: string[];
      if (monitoringContext) {
        scrapePlan = planScrapeStrategy({
          candidateUrls: sampledUrls,
          priorState: monitoringContext.priorState,
          sitemapLastmodByUrl,
          currentRulesetVersion: monitoringContext.currentRulesetVersion,
          ageFloorDays: monitoringContext.ageFloorDays,
          now: monitoringContext.now,
          forceRefetchUrls: monitoringContext.forceRefetchUrls,
        });
        urlsToFetch = Array.from(scrapePlan.refetch.keys());
      } else {
        urlsToFetch = sampledUrls;
      }

      // Reuse the caller's salvage sink as the live page accumulator so a
      // mid-crawl watchdog abort leaves the already-fetched pages visible to
      // the caller. Falls back to a private array when no sink is passed.
      const pages: LoadedPage[] = pageSink ?? [];

      // Fetch robots.txt once for the origin — reused for Crawl-Delay pacing and Disallow checks.
      const sourceOrigin = (() => { try { return new URL(source).origin; } catch { return ""; } })();
      const robots = await fetchRobotsMeta(sourceOrigin, timeoutMs, cache, stats, signal, validateHop);
      const effectiveConcurrency = robots.crawlDelaySec > 0 ? 1 : concurrency;
      const delayMs = robots.crawlDelaySec * 1000;

      await runWithConcurrency(urlsToFetch, effectiveConcurrency, async (url) => {
        if (budgetExceeded(byteBudget)) return;
        // Honor robots.txt for our own crawl when respectRobotsTxt is on (default).
        // The existing robotsComplianceRule flags sitemap-vs-robots conflicts as
        // findings; this actually refuses to fetch the disallowed URL. Keeps us
        // legally defensible (we are a bot, our UA `pseolint` is public, and we
        // respect Disallow directives) and removes the "crawler-for-hire" abuse
        // vector when the library is invoked from a hosted service.
        if (respectRobotsTxt) {
          try {
            const p = new URL(url).pathname;
            if (isDisallowedByRobots(p, robots.disallow)) {
              skippedByRobots.push(url);
              return;
            }
          } catch { /* URL parse failed — fall through, fetch will fail naturally */ }
        }

        const result = await fetchPageWithMeta(url, timeoutMs, cache, stats, signal, validateHop, followRedirects);
        if (result) {
          byteBudget.used += result.html.length;
          pages.push(result);
        }
        if (delayMs > 0) await sleep(delayMs);
      });

      // Link discovery fills the sample.
      // Legacy behavior: no budget set + crawlDiscovery true → fill from links (unchanged).
      // New behavior: budget set + crawlDiscovery true + opt-in flag → top up to budget.
      const budgetUnderfilled = discoveryBudget > 0 && pages.length < discoveryBudget;
      const legacyBudgetless = discoveryBudget === 0;
      const shouldFill =
        crawlDiscovery && (legacyBudgetless || (budgetUnderfilled && fillBudgetViaLinkDiscovery));

      if (shouldFill) {
        const sitemapUrlSet = new Set(allSitemapUrls);
        const discoveredUrls = new Set<string>();

        // robots already fetched above; reuse its Disallow patterns here.
        const disallowPatterns = robots.disallow;

        let discoveryCeilingReached = false;
        outer: for (const page of pages) {
          const linkMatches = Array.from(page.html.matchAll(/href=["']([^"']+)["']/gi));
          for (const match of linkMatches) {
            if (discoveredUrls.size >= maxCrawlDiscovered) {
              // Hard ceiling — don't let a malicious site with many self-links
              // extend crawl discovery up to the byte budget.
              discoveryCeilingReached = true;
              break outer;
            }
            const href = match[1];
            if (!href || href.startsWith("#") || /^mailto:|^tel:|^javascript:|^data:/i.test(href)) continue;
            try {
              const baseUrl = page.httpMeta?.finalUrl ?? page.url;
              const resolved = new URL(href, baseUrl).href;
              const resolvedUrl = new URL(resolved);
              if (resolvedUrl.origin !== sourceOrigin) continue;
              // Strip query and hash for dedup
              resolvedUrl.search = "";
              resolvedUrl.hash = "";
              const normalized = resolvedUrl.href;
              if (sitemapUrlSet.has(normalized) || discoveredUrls.has(normalized)) continue;
              if (isDisallowedByRobots(resolvedUrl.pathname, disallowPatterns)) continue;
              discoveredUrls.add(normalized);
            } catch {
              continue;
            }
          }
        }
        if (discoveryCeilingReached) {
          // eslint-disable-next-line no-console
          console.error(`pseolint: crawl discovery hit maxCrawlDiscovered=${maxCrawlDiscovered} ceiling; sampling from the first ${discoveredUrls.size} URLs.`);
        }

        if (discoveredUrls.size > 0) {
          const candidates = Array.from(discoveredUrls);
          // Fisher-Yates shuffle so we don't bias toward the first-discovered links (nav/footer).
          const shuffled = fisherYatesSample(candidates, candidates.length);
          const remaining = discoveryBudget === 0 ? Infinity : discoveryBudget - pages.length;
          const toFetch = remaining === Infinity ? shuffled : shuffled.slice(0, remaining);
          await runWithConcurrency(toFetch, effectiveConcurrency, async (url) => {
            if (budgetExceeded(byteBudget)) return;
            const result = await fetchPageWithMeta(url, timeoutMs, cache, stats, signal, validateHop, followRedirects);
            if (result && result.httpMeta && result.httpMeta.statusCode >= 200 && result.httpMeta.statusCode < 300) {
              byteBudget.used += result.html.length;
              pages.push(result);
            }
            if (delayMs > 0) await sleep(delayMs);
          });
        }
      }

      return { pages, sitemapUrls: new Set(allSitemapUrls), sitemapLastmodByUrl, discoveredUrlCount: allSitemapUrls.length, scrapePlan };
    }

    if (contentType.includes("html") || looksLikeHtml(text)) {
      const initialPage: LoadedPage = { url: source, html: text };
      // See note above: reuse the caller's salvage sink so a watchdog abort
      // during link-discovery crawling preserves the pages fetched so far.
      const pages: LoadedPage[] = pageSink ?? [];
      pages.push(initialPage);

      if (crawlDiscovery) {
        let sourceOrigin: string;
        try {
          sourceOrigin = new URL(source).origin;
        } catch {
          sourceOrigin = "";
        }

        const knownCrawled = new Set<string>([source]);
        const allDiscoveredUrls = new Set<string>([source]);
        const maxDepth = 3;

        // Sitemap-first discovery (like Google). Before link-crawling, read the
        // sitemap(s) the site declares — link-crawl only reaches *linked* pages,
        // but a pSEO site's whole point is thousands of programmatic URLs that
        // may be sparsely linked (or behind a build-frozen, under-linked nav).
        // Sources of truth, in order:
        //   1. `Sitemap:` directives in robots.txt (there can be several)
        //   2. failing that, probe /sitemap.xml then /sitemap_index.xml
        // Sitemap-listed URLs are authoritative, so we fetch them FIRST; the
        // link-crawl below then fills any remaining budget and dedups against
        // them. When no sitemap exists, this is a no-op and we crawl as before.
        if (sourceOrigin) {
          const robotsForDiscovery = await fetchRobotsMeta(sourceOrigin, timeoutMs, cache, stats, signal, validateHop);
          const probing = robotsForDiscovery.sitemaps.length === 0;
          const sitemapCandidates = probing
            ? [`${sourceOrigin}/sitemap.xml`, `${sourceOrigin}/sitemap_index.xml`]
            : robotsForDiscovery.sitemaps;
          const visitedSitemaps = new Set<string>();
          const sitemapListedUrls: string[] = [];
          for (const candidate of sitemapCandidates) {
            if (discoveryBudget > 0 && pages.length + sitemapListedUrls.length >= discoveryBudget) break;
            if (visitedSitemaps.has(candidate)) continue;
            let smText: string;
            let smType: string;
            try {
              if (validateHop) await validateHop(candidate);
              const fetched = await fetchWithRetry(candidate, timeoutMs, cache, stats, signal, validateHop, SITEMAP_MAX_BYTES);
              if (!fetched) continue;
              smText = fetched.text;
              smType = fetched.contentType;
            } catch {
              continue; // SSRF refusal, network error, etc. — skip this candidate
            }
            if (!(smType.includes("xml") || looksLikeSitemap(smText))) continue;
            const { urls: discoveredSmUrls } = await collectUrlsFromSitemap(
              smText, candidate, visitedSitemaps, timeoutMs, cache, stats, signal, validateHop,
            );
            pushAll(sitemapListedUrls, discoveredSmUrls);
            // When probing the conventional paths, stop at the first that hits.
            if (probing && discoveredSmUrls.length > 0) break;
          }

          // Same-origin + robots-aware filter, deduped against what we have.
          const seedUrls = Array.from(new Set(sitemapListedUrls)).filter((u) => {
            if (knownCrawled.has(u)) return false;
            try {
              const parsed = new URL(u);
              if (parsed.origin !== sourceOrigin) return false;
              if (respectRobotsTxt && isDisallowedByRobots(parsed.pathname, robotsForDiscovery.disallow)) {
                skippedByRobots.push(u);
                return false;
              }
              return true;
            } catch {
              return false;
            }
          });
          for (const u of seedUrls) allDiscoveredUrls.add(u);
          // Cap the seed fetch. With a sampling budget, fit under it; without one
          // (the default "audit everything" path) bound by maxCrawlDiscovered, the
          // same ceiling the link-crawl honors — otherwise a homepage audit of a
          // site with a 50k-URL sitemap would try to fetch all of them (the link
          // crawl never could, so this would be an unbounded-egress regression).
          const seedToFetch = discoveryBudget > 0
            ? seedUrls.slice(0, Math.max(0, discoveryBudget - pages.length))
            : seedUrls.slice(0, maxCrawlDiscovered);
          if (seedToFetch.length > 0) {
            await runWithConcurrency(seedToFetch, concurrency, async (url) => {
              if (budgetExceeded(byteBudget)) return;
              const result = await fetchPageWithMeta(url, timeoutMs, cache, stats, signal, validateHop, followRedirects);
              knownCrawled.add(url);
              if (result && result.httpMeta && result.httpMeta.statusCode >= 200 && result.httpMeta.statusCode < 300) {
                byteBudget.used += result.html.length;
                pages.push(result);
              }
            });
          }
        }

        for (let depth = 0; depth < maxDepth; depth += 1) {
          // Stop if we've hit the discovery budget
          if (discoveryBudget > 0 && pages.length >= discoveryBudget) break;

          const frontier = new Set<string>();

          for (const page of pages) {
            if (depth > 0 && !knownCrawled.has("__depth_" + depth + "_" + page.url)) continue;
            const linkMatches = Array.from(page.html.matchAll(/href=["']([^"']+)["']/gi));
            for (const match of linkMatches) {
              const href = match[1];
              if (!href || href.startsWith("#") || /^mailto:|^tel:|^javascript:|^data:/i.test(href)) continue;
              try {
                const baseUrl = page.httpMeta?.finalUrl ?? page.url;
                const resolved = new URL(href, baseUrl).href;
                const resolvedUrl = new URL(resolved);
                if (resolvedUrl.origin !== sourceOrigin) continue;
                if (/^\/_next\/|^\/api\/|^\/icon/i.test(resolvedUrl.pathname)) continue;
                resolvedUrl.search = "";
                resolvedUrl.hash = "";
                const normalized = resolvedUrl.href;
                if (!knownCrawled.has(normalized)) {
                  frontier.add(normalized);
                }
              } catch {
                continue;
              }
            }
          }

          // Track all discovered URLs even if we don't fetch them
          for (const url of frontier) {
            allDiscoveredUrls.add(url);
          }

          if (frontier.size === 0) break;

          // If budget active, only fetch up to budget
          let urlsToFetch = Array.from(frontier);
          if (discoveryBudget > 0) {
            const remaining = discoveryBudget - pages.length;
            if (remaining <= 0) break;
            if (urlsToFetch.length > remaining) {
              urlsToFetch = urlsToFetch.slice(0, remaining);
            }
          }

          const newPages: LoadedPage[] = [];
          await runWithConcurrency(urlsToFetch, concurrency, async (url) => {
            const result = await fetchPageWithMeta(url, timeoutMs, cache, stats, signal, validateHop, followRedirects);
            if (result && result.httpMeta && result.httpMeta.statusCode >= 200 && result.httpMeta.statusCode < 300) {
              newPages.push(result);
              knownCrawled.add(url);
              knownCrawled.add("__depth_" + (depth + 1) + "_" + url);
            } else {
              knownCrawled.add(url);
            }
          });

          pushAll(pages, newPages);
          if (newPages.length === 0) break;
        }

        return { pages, discoveredUrlCount: allDiscoveredUrls.size };
      }

      return { pages };
    }

    throw new Error(`Source URL does not look like HTML or sitemap XML: ${source}`);
  }

  const resolved = resolve(source);
  let sourceStat;
  try {
    sourceStat = await stat(resolved);
  } catch {
    throw new Error(`Unable to access source: ${resolved}`);
  }

  if (sourceStat.isFile()) {
    return { pages: [{ url: resolved, html: await readFile(resolved, "utf-8") }] };
  }

  if (sourceStat.isDirectory()) {
    // v0.5.15: if the directory contains _manifest.json, restore original URLs
    // from the fixture manifest. Without a manifest (or unparseable JSON), the
    // engine falls back to file-path URLs (existing behaviour for arbitrary
    // HTML directories). Missing files listed in a valid manifest are
    // propagated as errors — a stale manifest is a programmer error, not
    // a soft condition.
    const manifestPath = join(resolved, "_manifest.json");
    let hasManifest = false;
    let manifest: Record<string, string> | null = null;
    try {
      const raw = await readFile(manifestPath, "utf-8");
      manifest = JSON.parse(raw) as Record<string, string>;
      hasManifest = true;
    } catch {
      // No manifest file or invalid JSON — fall through to path-based loading
    }
    if (hasManifest && manifest !== null) {
      // Propagate missing-file errors (fail-loud: stale manifests must be noticed)
      const pages = await Promise.all(
        Object.entries(manifest).map(async ([originalUrl, relPath]) => ({
          url: originalUrl,
          html: await readFile(join(resolved, relPath), "utf-8"),
        }))
      );
      return { pages };
    }
    const htmlFiles = await collectHtmlFiles(resolved);
    const pages = await Promise.all(
      htmlFiles.map(async (filePath) => ({
        url: filePath,
        html: await readFile(filePath, "utf-8")
      }))
    );
    return { pages };
  }

  return { pages: [] };
}

export async function auditSource(source: string, options?: AuditOptions): Promise<AuditSummary> {
  const runId = generateRunId();
  const runStartedAt = Date.now();
  // Apply safeMode preset first, then let explicit options override it. Using
  // `??` preserves the "not set" vs "explicitly false" distinction — a user
  // who picks safeMode="saas" but passes `guardSsrf: false` gets the explicit
  // override. Localhost sources auto-promote to the `dev` preset unless the
  // caller explicitly set `safeMode` or passed `autoDevPreset: false`.
  const presetKey = resolveSafeModeKey(source, options);
  const preset = SAFE_MODE_PRESETS[presetKey];
  const concurrency = options?.concurrency ?? preset.concurrency ?? 5;
  const timeoutMs = options?.timeout ?? 30000;
  const ignorePatterns = options?.ignore ?? [];
  const respectNoindex = options?.respectNoindex ?? true;
  const skipDetectedAuth = options?.skipDetectedAuth ?? false;
  const skipBoilerplate = options?.skipBoilerplate ?? false;
  const skipSearchPages = options?.skipSearchPages ?? false;
  const skipEmptyBody = options?.skipEmptyBody ?? false;
  // v0.5.12: when pinnedUrls is non-empty, sampleSize is irrelevant — the
  // pinned list IS the sample. Force to 0 so the post-fetch sampling step
  // is a no-op and all pinned pages pass through untruncated.
  const hasPinnedUrlsEarly = Array.isArray(options?.pinnedUrls) && (options.pinnedUrls as ReadonlyArray<string>).length > 0;
  const sampleSize = hasPinnedUrlsEarly ? 0 : (options?.sampleSize ?? preset.sampleSize ?? 0);
  const externalSignal = options?.signal;
  const guardSsrf = options?.guardSsrf ?? preset.guardSsrf ?? false;
  const respectRobotsTxt = options?.respectRobotsTxt ?? preset.respectRobotsTxt ?? true;
  const followRedirects = options?.followRedirects ?? preset.followRedirects ?? true;
  const maxCrawlDiscovered = options?.maxCrawlDiscovered ?? preset.maxCrawlDiscovered ?? 5000;
  const skippedByRobots: string[] = [];

  // Backpressure: watch TTFB + 5xx rate during the crawl and abort if the
  // origin looks degraded. The audit signal is a composite of the caller's
  // signal (ctrl-C, parent timeout) and the monitor's abort controller.
  const backpressureEnabled = options?.backpressure !== false;
  const backpressureAbort = new AbortController();
  let backpressureError: OriginDegradedError | null = null;
  // Set once we've decided to salvage a partial report after a watchdog abort.
  // From that point `throwIfAborted` must NOT re-throw the backpressure error —
  // the watchdog already did its job (stopped fetching); the rest of the
  // pipeline runs over the pages collected so far and the truncation is
  // surfaced on the summary instead.
  let truncated = false;
  let truncatedReason: string | undefined;
  const signal = composeSignals(externalSignal, backpressureAbort.signal);

  const observer = new FetchObserver();
  // 2026-05-03 calibration: the prior (3s p95 cap, 2× baseline multiplier)
  // gate aborted 4 of 12 reputable-pSEO audits on what was normal load
  // variance — Zapier at p95=576ms (2.4× a 236ms baseline), Webflow at
  // p95=1808ms (2.2× 833ms), Airbyte at p95=1288ms (3.4× 380ms). For real
  // production CDNs these spikes are noise, not degradation. Raise the
  // gate so it still catches truly broken origins (sustained 4× slowdown
  // OR p95 above 8s) without tripping on normal audit-induced load.
  const monitor = backpressureEnabled
    ? new BackpressureMonitor({
        warmupSize: 10,
        absoluteP95Ms: 8000,
        baselineMultiplier: 4,
        // 2026-05-03 production fix: 0.1 (10%) was tripping pseolint.dev
        // audits on real production sites that legitimately return ~10% 5xx
        // (transient errors, async page renderers warming up, sites in
        // canary). Combined with the `>=` comparison bug (also fixed),
        // this aborted every web-app audit. 0.15 keeps the gate honest —
        // a sustained 15%+ 5xx rate is a real problem, not noise — while
        // letting transient errors not bring down the whole audit.
        errorRatioThreshold: 0.15,
      })
    : null;

  // v0.4: framework gets set on the first observation that carries headers
  // (the source URL fetch). Backpressure thresholds and computeReadiness use
  // it to soften limits when auditing a dev server.
  let detectedFramework: DetectedFramework | null = null;

  const onObservation = (obs: FetchObservation): void => {
    if (detectedFramework === null && obs.headers) {
      detectedFramework = detectDevServer(obs.headers);
    }
    observer.record(obs);
    if (!monitor) return;
    const decision = monitor.record(obs);
    if (decision.shouldAbort && !backpressureError && decision.snapshot) {
      backpressureError = new OriginDegradedError(decision.reason ?? "", decision.snapshot);
      backpressureAbort.abort(backpressureError);
    }
  };

  // Flip the run into salvage mode after a watchdog abort: record the reason so
  // assembly sets summary.truncated, and from here `throwIfAborted` will no
  // longer re-throw the backpressure error. Idempotent. Returns true when a
  // backpressure abort was present to salvage.
  function salvageBackpressure(): boolean {
    if (!backpressureError) return false;
    truncated = true;
    truncatedReason = backpressureError.message;
    return true;
  }

  function throwIfAborted(): void {
    // An EXTERNAL abort (ctrl-C, parent timeout) is always fatal: the caller
    // asked to stop, not to degrade. Check it first so it wins over salvage.
    if (externalSignal?.aborted) {
      throw externalSignal.reason ?? new DOMException("Audit aborted", "AbortError");
    }
    // A backpressure abort is salvageable. Once we've committed to a partial
    // report (`truncated`), swallow it and let the pipeline finish over the
    // pages collected so far. Before that commit, the loader-boundary catch
    // handles it; this guard only fires on the rare path where the loader
    // returned normally (e.g. a fetch mock that ignores the abort signal) yet
    // the watchdog still voted to abort — salvage rather than crash.
    if (backpressureError && !truncated) {
      salvageBackpressure();
    }
  }

  const resolvedRules = {
    nearDuplicateThreshold:
      options?.rules?.nearDuplicateThreshold ?? DEFAULTS.nearDuplicateThreshold,
    entitySwapThreshold: options?.rules?.entitySwapThreshold ?? DEFAULTS.entitySwapThreshold,
    thinContentMinWords: options?.rules?.thinContentMinWords ?? DEFAULTS.thinContentMinWords,
    publicationVelocityMaxPerDay:
      options?.rules?.publicationVelocityMaxPerDay ?? DEFAULTS.publicationVelocityMaxPerDay,
    publicationVelocityMaxPerDayCorpusFraction:
      options?.rules?.publicationVelocityMaxPerDayCorpusFraction
      ?? DEFAULTS.publicationVelocityMaxPerDayCorpusFraction,
    boilerplateMaxRatio: options?.rules?.boilerplateMaxRatio ?? DEFAULTS.boilerplateMaxRatio,
    templateDiversityMinUniqueRatio:
      options?.rules?.templateDiversityMinUniqueRatio ?? DEFAULTS.templateDiversityMinUniqueRatio,
    uniqueValueMinWords: options?.rules?.uniqueValueMinWords ?? DEFAULTS.uniqueValueMinWords,
    metaUniquenessMinJaccard:
      options?.rules?.metaUniquenessMinJaccard ?? DEFAULTS.metaUniquenessMinJaccard,
    linkDepthMaxClicks: options?.rules?.linkDepthMaxClicks ?? DEFAULTS.linkDepthMaxClicks,
    templateCoverageMinPages: options?.rules?.templateCoverageMinPages ?? DEFAULTS.templateCoverageMinPages,
    answerFirstMaxWords: options?.rules?.answerFirstMaxWords ?? DEFAULTS.answerFirstMaxWords,
    citableFactsMin: options?.rules?.citableFactsMin ?? DEFAULTS.citableFactsMin,
    citableFactsTarget: options?.rules?.citableFactsTarget ?? DEFAULTS.citableFactsTarget,
    freshnessMaxStaleDays: options?.rules?.freshnessMaxStaleDays ?? DEFAULTS.freshnessMaxStaleDays,
    modularityMaxParagraphWords: options?.rules?.modularityMaxParagraphWords ?? DEFAULTS.modularityMaxParagraphWords,
    modularityMinSelfContainedRatio: options?.rules?.modularityMinSelfContainedRatio ?? DEFAULTS.modularityMinSelfContainedRatio,
    faqMinQuestionHeadings: options?.rules?.faqMinQuestionHeadings ?? DEFAULTS.faqMinQuestionHeadings
  };

  const normalizeUrlOptions = mergeNormalizeUrlOptions({
    stripQuery: options?.rules?.stripUrlQuery ?? true,
    stripWwwHost: options?.rules?.stripWwwHost ?? false
  });

  const crawlDiscovery = /^https?:\/\//i.test(source) && (options?.crawlDiscovery ?? true);

  // Discovery budget: when sampleSize is set, cap discovery at 2x (min 50) to avoid
  // fetching far more pages than we'll sample. First-run egress is bounded by sampleSize;
  // re-runs hit the cache. Remove adaptive 200-cap: users get full crawl by default,
  // repeated audits stay cheap via --cache.
  const discoveryBudget = options?.sampleSize && options.sampleSize > 0
    ? Math.max(50, options.sampleSize * 2)
    : 0;

  const cacheStats: StatsWithObserver = { hits: 0, total: 0, bytesSavedEstimate: 0, onObservation };
  const cacheConfig: CacheConfig | null = options?.cache
    ? {
        dir: options.cache.dir ?? ".pseolint/cache",
        ttlMs: options.cache.ttlMs ?? 7 * 24 * 60 * 60 * 1000,
      }
    : null;
  // Size cap (post-audit eviction). Default 200 MB keeps pSEO-scale sites in check;
  // a single full crawl of a 5k-page site averages ~250 KB per body = ~1.25 GB uncapped.
  const cacheMaxBytes = options?.cache?.maxBytes ?? 209_715_200;

  const fillBudgetViaLinkDiscovery = options?.fillBudgetViaLinkDiscovery ?? false;
  const maxFetchBytes = options?.maxFetchBytes ?? preset.maxFetchBytes ?? 52_428_800;
  const fetchByteBudget: ByteBudget = { used: 0, cap: maxFetchBytes };

  // v0.4 §4.7: detectedFramework is set in onObservation above, side-effect
  // of the normal source URL fetch. No separate probe needed.

  // v0.5: read prior state BEFORE loadPagesFromSource so the change-driven
  // monitoring decision matrix can run pre-fetch and tell loadPagesFromSource
  // which URLs to actually fetch. Reading state is cheap; doing it here also
  // means we know `priorState` once for both the monitoring path and the
  // post-audit state-write path further down.
  let priorState: RunState | null = null;
  const skippedUrls: string[] = [];
  const currentRenderMode: RenderMode = options?.render ? "rendered" : "static";
  if (options?.state?.path || options?.state?.since || options?.state?.exitOnRegression || options?.state?.mode) {
    const statePath = options.state?.path ?? ".pseolint/state.json";
    priorState = await readState(statePath);
    if (priorState && priorState.renderMode !== currentRenderMode) {
      console.error(
        `warning: prior state renderMode=${priorState.renderMode} differs from current ${currentRenderMode}. Performing full re-audit.`
      );
      priorState = null;
    }
  }

  // Effective monitoring mode:
  //   - explicit `state.mode` wins ("monitoring" or "fresh")
  //   - else if `--since` is passed and prior state exists → "monitoring" (back-compat alias)
  //   - else if prior state exists → "monitoring" (auto, v0.5 default)
  //   - else → "fresh" (no prior state available)
  const explicitMode = options?.state?.mode;
  const effectiveMode: "monitoring" | "fresh" =
    explicitMode ??
    (priorState ? "monitoring" : "fresh");

  // Build the monitoring context only for HTTP sources in monitoring mode with
  // prior state. Single-page HTML and filesystem sources skip this — they are
  // exempted from the strategy (a single-page audit has nothing to plan; local
  // reads are cheap so re-reading every file beats branch complexity).
  const isHttpSource = /^https?:\/\//i.test(source);
  // If the user asked for monitoring against a filesystem source, surface that
  // we're ignoring the request. Silent bypass leads to "why is my state file
  // not being used?" debugging. Only log when the user actively chose
  // monitoring (explicit --mode or --since) — auto-monitoring on prior state
  // existence is implicit and shouldn't warn.
  if (!isHttpSource && effectiveMode === "monitoring" && (options?.state?.mode === "monitoring" || options?.state?.since)) {
    console.error(
      "warning: monitoring mode requested but source is a local file/directory; reading every HTML file (the matrix only applies to HTTP sources).",
    );
  }
  const monitoringContext: MonitoringContext | null =
    effectiveMode === "monitoring" && priorState && isHttpSource
      ? {
          priorState,
          currentRulesetVersion: CORE_RULESET_VERSION,
          ageFloorDays: options?.state?.ageFloorDays ?? DEFAULT_AGE_FLOOR_DAYS,
          now: new Date(),
          forceRefetchUrls: options?.force?.urls,
        }
      : null;

  if (!priorState && options?.state?.since) {
    console.error("no prior state found — performing full baseline audit");
  }

  // v0.5.12 — pinnedUrls fast path: bypass sitemap discovery + random sampling
  // entirely. Only fetch the caller-specified URLs. Validated same-origin for
  // HTTP sources. Filesystem sources treat pinnedUrls as absolute paths.
  let loadedPagesRaw: LoadedPage[];
  let sitemapUrlSet: Set<string> | undefined;
  let sitemapLastmodByUrl: Map<string, string> | undefined;
  let discoveredUrlCount: number | undefined;
  let scrapePlan: ScrapePlan | undefined;

  if (hasPinnedUrlsEarly) {
    const pinned = options!.pinnedUrls as ReadonlyArray<string>;
    // Validate same-origin for HTTP sources
    if (/^https?:\/\//i.test(source)) {
      let sourceOriginStr: string;
      try {
        sourceOriginStr = new URL(source).origin;
      } catch {
        throw new Error(`pinnedUrls: source URL is not a valid URL: ${source}`);
      }
      for (const u of pinned) {
        let pinnedOrigin: string;
        try {
          pinnedOrigin = new URL(u).origin;
        } catch {
          throw new Error(`pinnedUrls: "${u}" is not a valid absolute URL`);
        }
        if (pinnedOrigin !== sourceOriginStr) {
          throw new Error(
            `pinnedUrls: cross-origin URL rejected. Source origin is "${sourceOriginStr}" but pinned URL "${u}" has origin "${pinnedOrigin}". All pinnedUrls must be same-origin as the source.`
          );
        }
      }
    }
    // Fetch pinned URLs directly — no sitemap fetch, no sampling
    const ssrfCache = new Map<string, Promise<void>>();
    const validateHopPinned: ((u: string) => Promise<void>) | undefined = guardSsrf
      ? async (u: string) => {
          let host: string;
          try { host = new URL(u).hostname; } catch { throw new Error(`Refusing to fetch invalid URL: ${u}`); }
          let pending = ssrfCache.get(host);
          if (!pending) {
            pending = validateTargetHost(host).catch((err) => {
              if (err instanceof SSRFError) throw new Error(`Refusing to fetch ${u}: ${err.reason}`);
              throw err;
            });
            ssrfCache.set(host, pending);
          }
          await pending;
        }
      : undefined;
    const pinnedPages: typeof loadedPagesRaw = [];
    try {
      await runWithConcurrency(Array.from(pinned), concurrency, async (url) => {
        const result = await fetchPageWithMeta(url, timeoutMs, cacheConfig, cacheStats, signal, validateHopPinned, followRedirects);
        if (result) {
          fetchByteBudget.used += result.html.length;
          pinnedPages.push(result);
        }
      });
    } catch (err) {
      // Same salvage contract as the sitemap/crawl path: a watchdog abort
      // mid-fetch keeps the pages already collected in `pinnedPages`. Any other
      // error (external abort, SSRF rejection) is fatal — re-throw it.
      if (err instanceof OriginDegradedError) {
        salvageBackpressure();
      } else {
        throw err;
      }
    }
    loadedPagesRaw = pinnedPages;
    // No sitemap context in pinned mode
    sitemapUrlSet = undefined;
    sitemapLastmodByUrl = undefined;
    discoveredUrlCount = undefined;
    scrapePlan = undefined;
  } else {
    // Salvage sink: loadPagesFromSource fills this incrementally as pages come
    // back. If the backpressure watchdog aborts mid-crawl the call throws an
    // OriginDegradedError and the function's own return value is lost — but the
    // already-fetched pages survive here, so we recover them and continue the
    // pipeline with a `truncated` flag instead of throwing the whole run away.
    const pageSink: LoadedPage[] = [];
    try {
      const loaded = await loadPagesFromSource(source, concurrency, timeoutMs, crawlDiscovery, discoveryBudget, cacheConfig, cacheStats, fillBudgetViaLinkDiscovery, fetchByteBudget, signal, guardSsrf, respectRobotsTxt, skippedByRobots, followRedirects, maxCrawlDiscovered, monitoringContext, pageSink);
      loadedPagesRaw = loaded.pages;
      sitemapUrlSet = loaded.sitemapUrls;
      sitemapLastmodByUrl = loaded.sitemapLastmodByUrl;
      discoveredUrlCount = loaded.discoveredUrlCount;
      scrapePlan = loaded.scrapePlan;
    } catch (err) {
      // Only the watchdog abort is salvageable. An external abort (ctrl-C /
      // parent timeout) or any other error is fatal — re-throw it untouched so
      // --no-backpressure and ctrl-C behaviour are unchanged.
      if (err instanceof OriginDegradedError) {
        // Prefer the canonical backpressureError message (same object the
        // monitor raised); fall back to the caught error if somehow distinct.
        if (!salvageBackpressure()) {
          truncated = true;
          truncatedReason = err.message;
        }
        // Recover whatever was fetched before the abort. The sink is the same
        // array loadPagesFromSource was pushing into, so it holds the partial
        // page set even though the function never reached its `return`.
        loadedPagesRaw = pageSink;
        // No sitemap/discovery context survives a mid-sitemap abort; the
        // downstream classifier falls back to the loaded page URLs.
        sitemapUrlSet = undefined;
        sitemapLastmodByUrl = undefined;
        discoveredUrlCount = undefined;
        scrapePlan = undefined;
      } else {
        throw err;
      }
    }
  }
  // The scrapePlan tells us which URLs were skipped pre-fetch under monitoring
  // mode. Surface them in skippedUrls so they show up under summary.skippedUrls
  // (kept for back-compat with --since consumers); T7 will carry their prior
  // findings forward and T8 will surface the full plan in summary.scrapePlan.
  if (scrapePlan) {
    for (const url of scrapePlan.skip.keys()) {
      skippedUrls.push(url);
    }
  }
  throwIfAborted();
  const loadedPages = [...loadedPagesRaw];

  // v0.4 §4.7: content-type-aware crawling. Filter out fetched URLs whose
  // response Content-Type is not HTML (text/html or application/xhtml+xml).
  // Binary routes like /apple-icon, /opengraph-image, /icon get pushed to
  // crawlStats.skipped instead of being parsed as thin-content pages.
  const skippedByContentType: string[] = [];
  const htmlOnlyPages: LoadedPage[] = [];
  for (const p of loadedPages) {
    // httpMeta is set on URL fetches; locally-loaded files have no httpMeta
    // and are always HTML by definition (collectHtmlFiles only picks .html).
    // We don't have content-type on the LoadedPage object. Heuristic: if html
    // body doesn't contain any HTML markers, treat as non-HTML.
    if (!p.httpMeta) {
      htmlOnlyPages.push(p);
      continue;
    }
    if (looksLikeHtml(p.html)) {
      htmlOnlyPages.push(p);
    } else {
      skippedByContentType.push(p.url);
    }
  }
  loadedPages.splice(0, loadedPages.length, ...htmlOnlyPages);

  if (discoveredUrlCount && discoveredUrlCount > loadedPages.length) {
    console.error(`Discovered ${discoveredUrlCount} pages, fetched ${loadedPages.length} for audit. Use --sample-size 0 for full crawl.`);
  }

  // v0.5: prior state was loaded BEFORE loadPagesFromSource so the change-
  // driven monitoring decision matrix could run pre-fetch. URLs the matrix
  // marked as "skip" were never fetched and are recorded in skippedUrls
  // above. The old post-fetch contentHash skip is gone — the decision now
  // happens upstream of the network round-trip.

  let robotsTxtContent = "";
  if (/^https?:\/\//i.test(source)) {
    try {
      const origin = new URL(source).origin;
      const result = await fetchWithRetry(`${origin}/robots.txt`, timeoutMs, cacheConfig, cacheStats, signal);
      if (result) robotsTxtContent = result.text;
    } catch { /* ignore */ }
  }
  const deduped: LoadedPage[] = [];
  const urlHashes = new Map<string, string>();
  const duplicateUrlFindings: RuleResult[] = [];
  const duplicateConflictEmitted = new Set<string>();

  for (const page of loadedPages) {
    const key = normalizeAuditUrl(page.url, normalizeUrlOptions);
    const digest = hashHtml(page.html);
    const prev = urlHashes.get(key);
    if (prev !== undefined) {
      if (prev !== digest && !duplicateConflictEmitted.has(key)) {
        duplicateConflictEmitted.add(key);
        duplicateUrlFindings.push({
          ruleId: "audit/duplicate-url",
          severity: "info",
          message: `Duplicate crawl URL ${key} appeared with different HTML bodies; only the first occurrence was audited.`,
          pageUrl: key
        });
      }
      continue;
    }
    urlHashes.set(key, digest);
    deduped.push({ url: key, html: page.html, httpMeta: page.httpMeta });
  }

  const filtered = ignorePatterns.length > 0
    ? deduped.filter((page) => !shouldIgnore(page.url, ignorePatterns))
    : deduped;

  const strategy = options?.samplingStrategy ?? "stratified";
  // 2026-05-03 calibration credibility fix: when sampleSeed is set, use a
  // deterministic PRNG so repeated audits pick the same pages and the
  // verdict is reproducible. Without a seed, fall back to Math.random
  // (legacy behavior, kept for backward compatibility).
  const samplingRandom = options?.sampleSeed !== undefined
    ? mulberry32(options.sampleSeed)
    : Math.random;
  const isSampledAudit = sampleSize > 0 && sampleSize < filtered.length;
  const sampled = isSampledAudit
    ? (strategy === "stratified"
        ? (() => {
            const urlsMap = new Map(filtered.map(p => [p.url, p]));
            const sampledUrls = stratifiedSample(filtered.map(p => p.url), sampleSize, samplingRandom);
            return sampledUrls.map(u => urlsMap.get(u)!);
          })()
        : fisherYatesSample(filtered, sampleSize, samplingRandom))
    : filtered;

  const parsedPagesAll = sampled.map((page) => {
    const parsed = parseHtmlPage(page.html, page.url, { normalizeUrl: normalizeUrlOptions });
    if (page.httpMeta) {
      (parsed as unknown as Record<string, unknown>).httpMeta = page.httpMeta;
    }
    return parsed;
  });

  // v0.4.1 §page-filter: drop noindex'd pages and (when enabled) heuristically
  // detected auth pages BEFORE rule evaluation. The site owner's noindex is a
  // hard signal — they already opted out of SEO indexing, so auditing those
  // URLs produces only noise. Auth detection is opt-in via skipDetectedAuth
  // (off for the CLI by default; on for the hosted web form).
  const skippedByPolicy: Array<{
    url: string;
    reason: "noindex" | "auth-detected" | "boilerplate" | "search-result" | "spa-shell";
  }> = [];
  const parsedPages = parsedPagesAll.filter((p) => {
    const reason = pageSkipReason(p, {
      respectNoindex,
      skipDetectedAuth,
      skipBoilerplate,
      skipSearchPages,
      skipEmptyBody,
    });
    if (reason) {
      skippedByPolicy.push({ url: p.url, reason });
      return false;
    }
    return true;
  });
  const knownUrls = new Set(parsedPages.map((p) => p.url));
  const rootUrl =
    parsedPages.find((p) => /(^|[\\/])index\.html?$/i.test(p.url))?.url ?? parsedPages[0]?.url ?? "";
  const adjacency = new Map<string, Set<string>>();
  const inbound = new Map<string, number>(Array.from(knownUrls).map((url) => [url, 0]));
  for (const page of parsedPages) {
    const links = new Set(page.resolvedHrefs.filter((link) => knownUrls.has(link)));
    adjacency.set(page.url, links);
    for (const link of links) {
      inbound.set(link, (inbound.get(link) ?? 0) + 1);
    }
  }

  // Build entity patterns, merging user-supplied config patterns with defaults.
  // Flags are restricted to known-safe characters to prevent ReDoS via crafted flags;
  // each pattern is compiled eagerly so bad regexes fail at config time, not mid-audit.
  const SAFE_FLAGS_RE = /^[gimsuy]*$/;
  const entityPatterns: EntityMaskPattern[] = options?.entityPatterns
    ? [
        ...DEFAULT_ENTITY_PATTERNS,
        ...options.entityPatterns.map((p) => {
          const rawFlags = p.flags ?? "gi";
          if (!SAFE_FLAGS_RE.test(rawFlags)) {
            throw new Error(
              `Invalid regex flags "${rawFlags}" in entityPatterns for placeholder "${p.placeholder}". ` +
              `Only the flags g, i, m, s, u, y are permitted.`
            );
          }
          // Entity patterns are used with String.replace to mask every occurrence, which
          // requires the `g` flag. Add it if the user forgot — a silently broken "only first
          // match masked" regex would make template-detection rules (answer-first,
          // citable-facts) miss shared openers.
          const normalizedFlags = rawFlags.includes("g") ? rawFlags : `${rawFlags}g`;
          try {
            // Flags validated against SAFE_FLAGS_RE above; pattern is from trusted local config, not HTTP input.
            return { placeholder: p.placeholder, pattern: new RegExp(p.pattern, normalizedFlags) }; // nosemgrep
          } catch (err) {
            throw new Error(
              `Invalid regex pattern for placeholder "${p.placeholder}": ${(err as Error).message}`
            );
          }
        }),
      ]
    : DEFAULT_ENTITY_PATTERNS;

  // v0.4 §4.11 — pre-flight site classification. We compute this BEFORE the
  // rule pipeline so the dispatcher can skip pSEO-only rules on small
  // marketing sites / blogs. Classification is computed off the FULL
  // discovered URL set (sitemap when available, else loaded URLs). This
  // matters: a sampled crawl of a 5000-page directory must still classify
  // as `programmatic-directory`, not `unclear`.
  const classifierUrls: string[] = (() => {
    // v0.6.1 — explicit caller override takes priority. Lets calibration
    // fixtures audit a small sample but classify against full sitemap.
    if (options?.classifierUrls && options.classifierUrls.length > 0) {
      return [...options.classifierUrls];
    }
    if (sitemapUrlSet && sitemapUrlSet.size > 0) {
      return Array.from(sitemapUrlSet);
    }
    return loadedPagesRaw.map((p) => p.url);
  })();
  const classifierFramework: "nextjs" | "vite" | "astro" | "unknown" =
    detectedFramework ?? "unknown";
  const computedClassification = classifySite({
    urls: classifierUrls,
    framework: classifierFramework,
  });
  // v0.5.3 — degeneration guard. If the classifier landed on small-marketing
  // or blog but the corpus is degenerate (mostly thin / mostly identical
  // titles), downgrade to `unclear` so the small-marketing severity-demotion
  // table doesn't mask hard failures (the bestfirenze.com case).
  const guardedClassification = applyDegenerationGuard(
    computedClassification,
    corpusStatsFromPages(parsedPages),
  );
  // `--strict` (or AuditOptions.strict) keeps the classification but forces
  // every rule to run regardless of detected site type.
  const siteClassification: SiteClassification = options?.strict
    ? { ...guardedClassification, suppressedRules: [] }
    : guardedClassification;
  const suppressedRuleSet = new Set<string>(siteClassification.suppressedRules);

  // Classify pages into groups and run only enabled rules per group
  const classified = classifyPages(parsedPages, options?.pageGroups);
  const allFindings: RuleResult[] = [...duplicateUrlFindings];
  const groupScores: Record<string, number> = {};
  const groupPageCounts: Record<string, number> = {};

  // Surface robots-skipped URLs so users don't silently get a smaller audit
  // than expected. One rollup finding (not per-URL) to avoid flooding the
  // output on large sites. Also included on summary.skippedUrls below.
  if (skippedByRobots.length > 0) {
    allFindings.push({
      ruleId: "audit/skipped-by-robots",
      severity: "info",
      message: `Skipped ${skippedByRobots.length} sitemap URL${skippedByRobots.length === 1 ? "" : "s"} because the target's robots.txt Disallow'd them: ${skippedByRobots.slice(0, 5).join(", ")}${skippedByRobots.length > 5 ? ", …" : ""}.`,
      fix: "If you own this site and want to audit these URLs anyway, pass `respectRobotsTxt: false` (or remove the Disallow directive).",
      relatedUrls: skippedByRobots,
    });
  }

  // v0.4 §4.4: origin readiness is now diagnostic-only. The previous
  // `audit/origin-readiness` finding emission was retired — the structured
  // ReadinessReport in `summary.diagnostics.originReadiness` is the canonical
  // signal now (no double-counting in the issue buckets).

  const auditMode = options?.mode ?? "full";

  // Site-wide rules (run once, outside group loop)
  if (sitemapUrlSet && sitemapUrlSet.size > 0 && auditMode !== "diff") {
    const sitemapFindings = sitemapCompletenessRule(parsedPages, sitemapUrlSet);
    pushAll(allFindings,sitemapFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));

    if (robotsTxtContent) {
      const robotsFindings = robotsComplianceRule(parsedPages, sitemapUrlSet, robotsTxtContent);
      pushAll(allFindings,robotsFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
    }
  }

  // AEO site-wide rules. These run unconditionally (consistent with sitemap-completeness
  // and robots-compliance); page-group rule lists govern per-page AEO rules only.
  const llmsFindings = await llmsTxtRule(source, { timeoutMs });
  pushAll(allFindings,llmsFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));

  if (robotsTxtContent) {
    const crawlerFindings = crawlerAccessRule(robotsTxtContent);
    pushAll(allFindings,crawlerFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
  }

  // Data source comparison rules
  if (options?.dataSource?.records && options.dataSource.records.length > 0) {
    if (auditMode !== "diff" || isRuleAllowedInDiff("data/missing-binding")) {
      const dataBindingFindings = dataBindingRule(parsedPages, options.dataSource.records);
      pushAll(allFindings,dataBindingFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
    }
    if (auditMode !== "diff" || isRuleAllowedInDiff("data/identical-across-pages")) {
      const dataIdenticalFindings = dataIdenticalRule(parsedPages, options.dataSource.records);
      pushAll(allFindings,dataIdenticalFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
    }
  }

  for (const [groupName, groupPages] of classified) {
    if (groupPages.length === 0) continue;

    const groupConfig = groupName === "__default" ? undefined : options?.pageGroups?.[groupName];
    if (groupConfig?.rules !== undefined && groupConfig.rules.length === 0) continue;

    const groupRules = resolveGroupRules(
      resolvedRules as unknown as Record<string, unknown>,
      groupConfig?.overrides
    ) as typeof resolvedRules;
    const enabledCheck = (ruleId: string) =>
      !suppressedRuleSet.has(ruleId) && isRuleEnabled(ruleId, groupConfig?.rules);

    const findings = runRulesOnPages(
      groupPages, parsedPagesAll, groupRules, enabledCheck, groupName,
      knownUrls, adjacency, inbound, rootUrl,
      normalizeUrlOptions, source, DEFAULT_ENTITY_PATTERNS,
      groupConfig?.overrides,
      options?.mode ?? "full",
      // 2026-05-06 calibration fix: pinnedUrls mode fetches a hand-picked subset
      // of the full site — the link graph across those pages is structurally
      // incomplete, just like a random-sampled crawl. Pass `true` so
      // links/unreachable-from-root skips its check rather than emitting
      // sampling-artifact false positives (22/25 Wise pages flagged "unreachable"
      // because the nav paths between locale-specific currency-converter URLs
      // were not in the pinned set).
      isSampledAudit || hasPinnedUrlsEarly,
    );

    pushAll(allFindings,findings);
    groupPageCounts[groupName] = groupPages.length;
    // v0.4.3: per-group scoring uses the same site-classification profile so
    // group-level risk numbers reflect the same severity / confidence remaps
    // as the headline verdict.
    const { risk: groupRisk } = scoreFromFindings(
      applyScoringProfileOverrides(findings, siteClassification),
      siteClassification,
      groupPages.length,
    );
    groupScores[groupName] = groupRisk;
  }

  throwIfAborted();

  // v0.5.8 — content/value-add composite: second-pass rule that reads from
  // the full allFindings array to compute a per-page quality synthesis score.
  // Must run AFTER all per-page rules so all source signals are present.
  {
    const isValueAddEnabled =
      !suppressedRuleSet.has("content/value-add") &&
      isRuleEnabled("content/value-add", undefined) &&
      (auditMode === "full" || isRuleAllowedInDiff("content/value-add"));
    if (isValueAddEnabled) {
      const valueAddFindings = valueAddRule(parsedPages, allFindings);
      pushAll(allFindings,valueAddFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
    }
  }

  // Enrich findings: cluster pairwise, detect templates, assign effort
  const enriched = enrichFindings(allFindings, parsedPages, {
    templateGenerated: options?.templateGenerated,
  });

  // Populate docsUrl on every finding before they leave the engine.
  withDocsUrls(enriched.findings);

  // v0.4.3: apply site-type-aware severity + confidence overrides so blocker
  // counts, issue buckets, and category bucketing all reflect the user-visible
  // severity (not the rule's native severity). The remapped findings replace
  // the enrichment output so every downstream consumer (summary.issues, AI
  // triage input, telemetry, formatters) sees the corrected severity.
  enriched.findings = applyScoringProfileOverrides(enriched.findings, siteClassification);

  // v0.5: change-driven monitoring carry-forward. URLs that the pre-fetch
  // strategy marked as "skip" were never fetched this run, so no rule produced
  // findings for them. Restore their findings from prior state, marked with
  // `carriedForward: true` and `lastVerifiedAt` so consumers can reason about
  // staleness. Inject after enrichment + overrides — these findings already
  // went through both in their original run; re-running enrichment would
  // strip their template / cluster assignments because parsedPages doesn't
  // contain the skipped pages.
  if (priorState && skippedUrls.length > 0) {
    for (const url of skippedUrls) {
      const prior = priorState.urls[url];
      if (!prior || prior.findings.length === 0) continue;
      for (const f of prior.findings) {
        const carried: RuleResult = {
          ruleId: f.ruleId,
          severity: f.severity as Severity,
          message: f.message,
          confidence: f.confidence as Confidence,
          carriedForward: true,
          lastVerifiedAt: prior.fetchedAt,
          // State stores `url` but the engine type uses `pageUrl` — map back.
          pageUrl: typeof f.url === "string" ? f.url : url,
        };
        // Optional fields are preserved opportunistically when present in state.
        if (typeof f.fix === "string") carried.fix = f.fix;
        if (typeof f.ref === "string") carried.ref = f.ref;
        if (typeof f.docsUrl === "string") carried.docsUrl = f.docsUrl;
        if (Array.isArray(f.relatedUrls)) carried.relatedUrls = f.relatedUrls as string[];
        if (typeof f.group === "string") carried.group = f.group;
        if (typeof f.similarity === "number") carried.similarity = f.similarity;
        if (f.context !== undefined) carried.context = f.context as FindingContext;
        if (f.effort !== undefined) carried.effort = f.effort as FixEffort;
        enriched.findings.push(carried);
      }
    }
  }

  // v0.6 — template detection + per-template scoring (opt-in, additive).
  // Activation gating per spec §11.1 / §15.3:
  //   - Site classification is NOT `unclear` AND NOT `small-marketing`
  //   - detectTemplates returns ≥ 2 qualifying (non-longtail) templates
  // Otherwise: legacy path, `templates` stays empty.
  let siteTemplates: Template[] = [];
  const canActivateV6 =
    siteClassification.type !== "unclear" &&
    siteClassification.type !== "small-marketing";

  if (canActivateV6) {
    const templateCandidates = detectTemplates(classifierUrls);
    if (shouldActivateTemplateScoring(templateCandidates)) {
      const urlToTemplate = buildUrlToTemplateMap(templateCandidates);
      const totalDiscovered = classifierUrls.length;
      siteTemplates = scoreTemplates(
        enriched.findings,
        templateCandidates,
        urlToTemplate,
        totalDiscovered,
      );
    }
  }

  const { risk, categories, bucketCounts } = scoreFromFindings(enriched.findings, siteClassification, parsedPages.length);
  const auditedPageCount = Object.values(groupPageCounts).reduce((a, b) => a + b, 0);

  const issues = bucketIssues(enriched.findings);

  // v0.6.0 — spec §15.1: site verdict comes from siteVerdictFromTemplates when
  // ≥1 template has ≥5% coverage. Falls back to the legacy risk-ladder verdict
  // when no template meets the threshold (single-template sites, `unclear`/
  // `small-marketing` classifications, or the long-tail-only case).
  // The `risk` score is intentionally unchanged — §15.1 governs verdict only.
  const legacyVerdict = shiftVerdictForAuthority(verdictForRisk(risk), options?.authorityScore);
  const templateVerdict = siteVerdictFromTemplates(siteTemplates);
  const verdict = templateVerdict !== null ? templateVerdict : legacyVerdict;

  const headline = buildHeadline(bucketCounts);

  // audit/* findings are diagnostic-only and never appear in summary.issues.
  // Surface them under diagnostics so consumers (telemetry, debug UIs) can
  // still see what was deduped or skipped.
  const auditFindings = enriched.findings.filter((f) => f.ruleId.startsWith("audit/"));

  const readinessReport = computeReadiness(observer.getAll(), { detectedFramework });
  const crawlStats: CrawlStats = {
    discovered: discoveredUrlCount ?? loadedPagesRaw.length,
    fetched: parsedPages.length,
    skipped: skippedByContentType.length + skippedByRobots.length + skippedUrls.length,
  };

  const appliedSeverityDemotions = computeAppliedDemotions(enriched.findings, siteClassification);
  const summary: AuditSummary = {
    schemaVersion: SCHEMA_VERSION,
    verdict,
    risk,
    headline,
    categories,
    issues,
    siteClassification,
    appliedSeverityDemotions: appliedSeverityDemotions.length > 0 ? appliedSeverityDemotions : undefined,
    diagnostics: {
      originReadiness: readinessReport,
      crawlStats,
      auditFindings,
    },
    templates: siteTemplates,
    groupScores: options?.pageGroups ? groupScores : undefined,
    groupPageCounts: options?.pageGroups ? groupPageCounts : undefined,
    pageCount: auditedPageCount || parsedPages.length,
    templateDetected: enriched.templateDetected,
    rawFindingCount: enriched.rawFindingCount,
    // v0.5.12 — sorted list of audited page URLs for --repin capture
    auditedUrls: parsedPages.length > 0
      ? [...parsedPages.map((p) => p.url)].sort()
      : undefined,
  };

  // Partial-report flag: the backpressure watchdog aborted mid-crawl and we
  // salvaged whatever pages had been fetched. Consumers MUST treat coverage as
  // a lower bound (counts/verdict are partial). Only set when actually
  // truncated so complete runs keep `truncated` absent.
  if (truncated) {
    summary.truncated = true;
    summary.truncatedReason = truncatedReason;
  }

  if (cacheConfig) {
    summary.cacheStats = cacheStats;
  }

  // v0.4 §4.5 / v0.4.1: warn when ignore patterns matched zero discovered URLs.
  //   - Per-pattern warning fires only when `warnUnmatchedIgnore` is true
  //     (set by the CLI when `--ignore` was passed explicitly). Quiet by
  //     default for config-loaded patterns where broad safety lists like
  //     `**/dashboard/**` legitimately don't match small marketing sites.
  //   - When ALL patterns matched zero (strongest typo signal, e.g. user
  //     wrote `*.json` instead of `**/*.json`), emit a single consolidated
  //     warning regardless of source.
  if (ignorePatterns.length > 0) {
    const unmatched = ignorePatterns.filter(
      (pattern) => !deduped.some((p) => globMatchPathname(pattern, p.url)),
    );
    if (unmatched.length === ignorePatterns.length) {
      // eslint-disable-next-line no-console
      console.warn(
        `[pseolint] none of the ${ignorePatterns.length} ignore pattern${ignorePatterns.length === 1 ? "" : "s"} matched any URLs — check config or --ignore for typos`,
      );
    } else if (options?.warnUnmatchedIgnore === true) {
      for (const pattern of unmatched) {
        // eslint-disable-next-line no-console
        console.warn(`[pseolint] ignore pattern '${pattern}' matched 0 URLs — likely typo`);
      }
    }
  }

  // Merge state-skipped (unchanged since last run), robots-skipped (target
  // robots.txt Disallow'd), and policy-skipped (noindex / detected-auth) URLs
  // so callers have a single audit-skipped surface.
  const allSkipped = [
    ...skippedUrls,
    ...skippedByRobots,
    ...skippedByPolicy.map((s) => s.url),
  ];
  if (allSkipped.length > 0) {
    summary.skippedUrls = allSkipped;
  }

  // v0.5+: surface the change-driven monitoring summary when this run was a
  // monitoring run (had prior state and didn't force --mode=fresh). Filesystem
  // sources don't get a scrapePlan because they bypass the matrix.
  if (effectiveMode === "monitoring" && priorState && scrapePlan) {
    const reasonCounts: Record<string, number> = {};
    for (const reason of scrapePlan.refetch.values()) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
    for (const reason of scrapePlan.skip.values()) {
      reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    }
    // `fetched` is the number of URLs whose bodies actually came back —
    // robots-disallowed, byte-budget-exceeded, content-type-filtered, and 4xx
    // URLs the matrix INTENDED to refetch may have dropped out before we got
    // here. `intended` (= scrapePlan.refetch.size) is exposed too so callers
    // can spot the gap (e.g. "intended 200, fetched 187, 13 URLs dropped").
    summary.scrapePlan = {
      fetched: loadedPages.length,
      intended: scrapePlan.refetch.size,
      carriedForward: scrapePlan.skip.size,
      reasonCounts,
      rulesetVersion: CORE_RULESET_VERSION,
      lastFullAuditAt: priorState.lastFullAuditAt ?? priorState.lastRun ?? null,
    };
  }

  // v0.4.1: surface noindex / auth skips as a discoverable diagnostic so the
  // user sees what the engine excluded. Catches the accidental-noindex bug:
  // pages silently dropped from indexing show up as a visible skip line
  // instead of being absent without explanation.
  if (skippedByPolicy.length > 0) {
    const noindexCount = skippedByPolicy.filter((s) => s.reason === "noindex").length;
    const authCount = skippedByPolicy.filter((s) => s.reason === "auth-detected").length;
    const boilerplateCount = skippedByPolicy.filter((s) => s.reason === "boilerplate").length;
    const searchCount = skippedByPolicy.filter((s) => s.reason === "search-result").length;
    const spaShellCount = skippedByPolicy.filter((s) => s.reason === "spa-shell").length;
    const sample = skippedByPolicy.slice(0, 5).map((s) => `${s.url} (${s.reason})`).join(", ");
    const more = skippedByPolicy.length > 5 ? `, +${skippedByPolicy.length - 5} more` : "";
    const parts: string[] = [];
    if (noindexCount > 0) parts.push(`${noindexCount} marked noindex`);
    if (authCount > 0) parts.push(`${authCount} detected as auth (login/register/etc)`);
    if (boilerplateCount > 0) parts.push(`${boilerplateCount} cookie/legal/consent boilerplate`);
    if (searchCount > 0) parts.push(`${searchCount} search-result page${searchCount === 1 ? "" : "s"}`);
    if (spaShellCount > 0) parts.push(`${spaShellCount} un-hydrated SPA shell${spaShellCount === 1 ? "" : "s"}`);
    auditFindings.push({
      ruleId: "audit/skipped-by-policy",
      severity: "info",
      message: `Skipped ${skippedByPolicy.length} page${skippedByPolicy.length === 1 ? "" : "s"} from rule evaluation — ${parts.join(", ")}. First few: ${sample}${more}.`,
      relatedUrls: skippedByPolicy.map((s) => s.url),
    });
  }

  // Local flat view of every finding the engine produced, used internally for
  // state persistence, regression detection, AI triage input, and telemetry
  // counts. NOT exposed on the AuditSummary — consumers must use
  // `summary.issues.{blockers,shouldFix,informational}` and
  // `summary.diagnostics.auditFindings`.
  const enrichedFindings: RuleResult[] = enriched.findings;

  if (priorState && options?.state?.exitOnRegression) {
    let hasRegression = false;
    const currentFindings = new Map<string, Set<string>>();
    for (const f of enrichedFindings) {
      if (!f.pageUrl) continue;
      // Carried-forward findings are not "current" — we did not re-verify them
      // this run. Including them would mask a genuine regression on a skipped
      // URL: prior set has rule X carried-forward, current set also has X
      // (carried-forward), comparison says "no new rule", we miss the case
      // where the page actually started failing rule Y too.
      if (f.carriedForward) continue;
      const set = currentFindings.get(f.pageUrl) ?? new Set<string>();
      set.add(f.ruleId);
      currentFindings.set(f.pageUrl, set);
    }
    for (const [url, entry] of Object.entries(priorState.urls)) {
      const cur = currentFindings.get(url);
      if (!cur) continue;
      const priorIds = new Set(entry.findingIds);
      for (const ruleId of cur) {
        if (!priorIds.has(ruleId)) {
          hasRegression = true;
          break;
        }
      }
      if (hasRegression) break;
    }
    summary.hasRegression = hasRegression;
  }

  if (options?.state) {
    const statePath = options.state.path ?? ".pseolint/state.json";
    const renderMode: RenderMode = options.render ? "rendered" : "static";
    const urls: Record<string, UrlStateEntry> = {};
    const findingsByUrl = new Map<string, string[]>();
    // v0.5+: persist full finding records per URL so future monitoring runs
    // can carry them forward when the URL is skipped pre-fetch. Carried-
    // forward findings (carriedForward=true) are NOT re-persisted under the
    // fetched URL — they belong to the prior entry that's preserved verbatim
    // for skipped URLs above.
    const fullFindingsByUrl = new Map<string, RuleResult[]>();
    for (const f of enrichedFindings) {
      if (!f.pageUrl) continue;
      const list = findingsByUrl.get(f.pageUrl) ?? [];
      if (!list.includes(f.ruleId)) list.push(f.ruleId);
      findingsByUrl.set(f.pageUrl, list);
      if (!f.carriedForward) {
        const records = fullFindingsByUrl.get(f.pageUrl) ?? [];
        records.push(f);
        fullFindingsByUrl.set(f.pageUrl, records);
      }
    }
    // Preserve prior entries for URLs the monitoring matrix skipped (we never
    // fetched them this run; their fetchedAt MUST NOT advance or the age floor
    // never trips). Skipped URLs include those in scrapePlan.skip plus any
    // robots-skipped URLs from prior runs that are still in priorState.
    if (priorState && skippedUrls.length > 0) {
      for (const url of skippedUrls) {
        const prior = priorState.urls[url];
        if (prior) urls[url] = prior;
      }
    }
    const nowIso = new Date().toISOString();
    for (const p of loadedPages) {
      const priorEntry = priorState?.urls[p.url];
      const responseHeaders = p.httpMeta?.headers;
      const lastModifiedHeader = responseHeaders?.["last-modified"];
      const etagHeader = responseHeaders?.["etag"];
      const sitemapLastmodForUrl = sitemapLastmodByUrl?.get(p.url);
      const entry: UrlStateEntry = {
        contentHash: computeContentHash(p.html),
        fetchedAt: nowIso,
        status: p.httpMeta?.statusCode ?? 200,
        findingIds: findingsByUrl.get(p.url) ?? [],
        findings: (fullFindingsByUrl.get(p.url) ?? []).map((f) => ({
          id: `${f.ruleId}::${p.url}`,
          ruleId: f.ruleId,
          severity: f.severity,
          confidence: f.confidence ?? "high",
          message: f.message,
          ...(f.fix !== undefined ? { fix: f.fix } : {}),
          ...(f.ref !== undefined ? { ref: f.ref } : {}),
          ...(f.docsUrl !== undefined ? { docsUrl: f.docsUrl } : {}),
          ...(f.pageUrl !== undefined ? { url: f.pageUrl } : {}),
          ...(f.relatedUrls !== undefined ? { relatedUrls: f.relatedUrls } : {}),
          ...(f.group !== undefined ? { group: f.group } : {}),
          ...(f.similarity !== undefined ? { similarity: f.similarity } : {}),
          ...(f.context !== undefined ? { context: f.context } : {}),
          ...(f.effort !== undefined ? { effort: f.effort } : {}),
        })),
        rulesetVersion: CORE_RULESET_VERSION,
      };
      if (lastModifiedHeader) entry.lastModified = lastModifiedHeader;
      else if (priorEntry?.lastModified) entry.lastModified = priorEntry.lastModified;
      if (etagHeader) entry.etag = etagHeader;
      else if (priorEntry?.etag) entry.etag = priorEntry.etag;
      if (sitemapLastmodForUrl) entry.sitemapLastmodAtAudit = sitemapLastmodForUrl;
      else if (priorEntry?.sitemapLastmodAtAudit) entry.sitemapLastmodAtAudit = priorEntry.sitemapLastmodAtAudit;
      urls[p.url] = entry;
    }
    // `lastFullAuditAt` advances only when this run actually re-fetched every
    // candidate URL. In monitoring mode (matrix skipped some URLs), preserve
    // the prior baseline timestamp so callers can reason about staleness.
    // In fresh mode (every candidate URL was fetched), bump to now.
    const isMonitoringRun = effectiveMode === "monitoring" && priorState !== null;
    const lastFullAuditAt = isMonitoringRun
      ? (priorState?.lastFullAuditAt ?? priorState?.lastRun ?? nowIso)
      : nowIso;
    const newState: RunState = {
      version: STATE_SCHEMA_VERSION,
      lastRun: nowIso,
      lastFullAuditAt,
      source,
      renderMode,
      rulesetVersion: CORE_RULESET_VERSION,
      urls,
      summary: {
        score: summary.risk,
        totalFindings: enrichedFindings.length,
        byCategory: Object.fromEntries(
          (Object.entries(summary.categories) as [string, { issues: number }][])
            .map(([k, v]) => [k, v.issues])
        ),
      },
    };
    await writeState(statePath, newState);
  }

  // Captured for telemetry even when triage is skipped, so users can diagnose
  // model/provider reliability from their local stats.jsonl.
  let triageAttempt: { providerId: string; modelId: string; skipReason: string } | undefined;

  if (options?.ai?.enabled) {
    if (options.ai.apiKey) {
      console.error(
        "[ai-triage] warning: ai.apiKey is set in options. Prefer env vars (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.) — never commit an apiKey to a config file.",
      );
    }
    try {
      const resolved = await createLanguageModel({
        provider: options.ai.provider,
        model: options.ai.model,
        endpoint: options.ai.endpoint,
        apiKey: options.ai.apiKey,
      });
      const cacheConfig =
        options.ai.cache === false
          ? false
          : {
              dir: options.ai.cache?.dir ?? ".pseolint/ai-cache",
              ttlMs: options.ai.cache?.ttlMs ?? 30 * 24 * 60 * 60 * 1000,
            };

      // Daily-budget pre-flight read (best-effort — missing file is fine).
      let spentTodayUsd: number | undefined;
      if (options.ai.dailyBudgetUsd !== undefined) {
        const telemetryPath = options.telemetry?.path ?? ".pseolint/telemetry.jsonl";
        try {
          spentTodayUsd = await todayTriageSpendUsd(telemetryPath);
        } catch {
          spentTodayUsd = 0;
        }
      }

      throwIfAborted();

      const outcome = await triageFindings(enrichedFindings, summary.pageCount, {
        enabled: true,
        model: resolved.model,
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        maxInputTokens: options.ai.maxInputTokens,
        maxOutputTokens: options.ai.maxOutputTokens,
        maxCostUsd: options.ai.maxCostUsd,
        dailyBudgetUsd: options.ai.dailyBudgetUsd,
        spentTodayUsd,
        cache: cacheConfig,
      });
      if (outcome.skipReason) {
        console.error(`[ai-triage] skipped: ${outcome.skipReason}`);
        triageAttempt = { providerId: resolved.providerId, modelId: resolved.modelId, skipReason: outcome.skipReason };
      } else {
        summary.triage = outcome.result;
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unknown error";
      console.error(`[ai-triage] skipped: ${reason}`);
      // No resolved model — providerId/modelId blank.
      triageAttempt = { providerId: options.ai.provider ?? "", modelId: options.ai.model ?? "", skipReason: reason };
    }
  }

  if (options?.telemetry?.enabled) {
    const telemetryPath = options.telemetry.path ?? ".pseolint/telemetry.jsonl";

    const auditRecord: AuditRecord = {
      type: "audit",
      schemaVersion: 1,
      runId,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - runStartedAt,
      score: summary.risk,
      pageCount: summary.pageCount,
      findingCount: enrichedFindings.length,
      ...(summary.rawFindingCount !== undefined && { rawFindingCount: summary.rawFindingCount }),
      ...(summary.templateDetected !== undefined && { templateDetected: summary.templateDetected }),
      ...(summary.cacheStats && { cacheStats: summary.cacheStats }),
      ...(summary.triage && {
        triage: {
          success: true,
          rootCauseCount: summary.triage.rootCauses.length,
          providerId: summary.triage.providerId,
          modelId: summary.triage.modelUsed,
          cacheHit: summary.triage.cacheHit,
          tokenUsage: summary.triage.tokenUsage,
          ...(summary.triage.estimatedCostUsd !== undefined && {
            estimatedCostUsd: summary.triage.estimatedCostUsd,
          }),
          truncatedInput: summary.triage.truncatedInput,
        },
      }),
      ...(!summary.triage && triageAttempt && {
        triage: {
          success: false,
          skipReason: triageAttempt.skipReason,
          rootCauseCount: 0,
          providerId: triageAttempt.providerId,
          modelId: triageAttempt.modelId,
          cacheHit: false,
          tokenUsage: { input: 0, output: 0 },
          truncatedInput: false,
        },
      }),
    };

    await appendTelemetryRecord(telemetryPath, auditRecord);

    // Feedback: only if triage ran
    if (summary.triage) {
      let rating: "helpful" | "unhelpful" | "skipped" | undefined;
      if (options.telemetry.feedback) {
        rating = options.telemetry.feedback;
      } else if (options.telemetry.prompt !== false) {
        rating = await promptTriageFeedback();
      }
      if (rating) {
        const feedbackRecord: FeedbackRecord = {
          type: "feedback",
          schemaVersion: 1,
          runId,
          timestamp: new Date().toISOString(),
          rating,
        };
        await appendTelemetryRecord(telemetryPath, feedbackRecord);
      }
    }
  }

  const aiHintEnabled = options?.ai?.suggest !== false;
  if (aiHintEnabled && !options?.ai?.enabled && process.env.ANTHROPIC_API_KEY) {
    console.error(
      `💡 AI triage available — re-run with --ai to prioritize ${enrichedFindings.length} findings into a fix list.`,
    );
  }

  if (cacheConfig && cacheMaxBytes > 0) {
    try {
      const pruneResult = await pruneCache(cacheConfig.dir, cacheMaxBytes);
      if (pruneResult.removedEntries > 0 || pruneResult.removedTmpFiles > 0) {
        const freedMb = ((pruneResult.before.bytes - pruneResult.after.bytes) / 1024 / 1024).toFixed(1);
        console.error(
          `pseolint: cache prune freed ${freedMb} MB (${pruneResult.removedEntries} entries, ${pruneResult.removedTmpFiles} .tmp files); size=${(pruneResult.after.bytes / 1024 / 1024).toFixed(1)}MB / cap=${(cacheMaxBytes / 1024 / 1024).toFixed(0)}MB`,
        );
      }
    } catch {
      // Non-fatal: eviction failure must not break the audit.
    }
  }

  return summary;
}
