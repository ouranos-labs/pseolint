export type Severity = "info" | "warning" | "error" | "critical";

/**
 * v0.4.3 — confidence level attached to a finding. Independent of severity:
 * a `low`-confidence `error` finding is "we think this is bad but might be a
 * false-positive on your site type." Formatters can render the caveat in the
 * message; scoring profiles can downweight low/speculative findings.
 *
 *   - `high`        — rule fires on signals it was designed to detect
 *   - `medium`      — rule fires but site context might justify ignoring
 *   - `low`         — known false-positive risk on this site type / shape
 *   - `speculative` — heuristic match; verify before acting
 */
export type Confidence = "high" | "medium" | "low" | "speculative";

/** Verdict ladder — replaces the old numeric `score` field as the user-facing signal. */
export type Verdict = "ready" | "caution" | "concerning" | "critical";

/** Letter grade per category. */
export type Grade = "A" | "B" | "C" | "D" | "F";

/**
 * Top-level public-output schema version for `AuditSummary` (the shape
 * `formatJson` serializes). Bumps on EVERY breaking OR additive-public output
 * change so programmatic consumers (CI gates, pseolint-gate-style scripts) can
 * branch on it instead of silently breaking. The stable contract is published
 * as a JSON Schema at `schemas/audit-summary.schema.json` (its `$id` carries
 * this same version string).
 *
 * Current value `"2026-06-v0.6"` covers the v0.6 `templates: Template[]`
 * addition and the `truncated` / `truncatedReason` partial-coverage fields.
 * (The prior `"2026-04-v0.4"` was never bumped when those landed — this
 * corrects that drift.)
 */
export const SCHEMA_VERSION = "2026-06-v0.6";

/** Options for `normalizeAuditUrl` (HTTP identity). */
export interface NormalizeUrlOptions {
  /** When true (default), drop `?query` for URL identity. */
  stripQuery?: boolean;
  /** When true, strip a leading `www.` from the hostname (opt-in; can be wrong for some TLDs). */
  stripWwwHost?: boolean;
}

export interface ParseHtmlOptions {
  normalizeUrl?: NormalizeUrlOptions;
}

export type FixEffort = "quick" | "moderate" | "structural";

export type FindingContext =
  | {
      type: "cluster";
      clusterSize: number;
      members: string[];
      worstPairs: Array<{
        left: string;
        right: string;
        similarity: number;
      }>;
      similarityRange: [number, number];
    }
  | {
      type: "contentBreakdown";
      sharedBlocks: Array<{ text: string; wordCount: number }>;
      sharedWordCount: number;
      uniqueWordCount: number;
      totalWordCount: number;
    };

/** v0.6 — per-rule fire-rate variance within a template cluster. */
export interface TemplateVariance {
  /** Per-rule fire-rate within the template. e.g. {"spam/thin-content": 0.8} */
  ruleFireRates: Record<string, number>;
  /**
   * Templates with high uniformity score have consistent quality across pages.
   * Low uniformity = some pages pass, others fail (template is incomplete or
   * data-quality-dependent). 0 to 1, higher = more uniform.
   *
   * Formula: 1 - mean(stdev(per-rule fire patterns across samples))
   */
  uniformityScore: number;
  /** Worst-firing rule + its rate — surfaced in the template card UI. */
  topDriver: { ruleId: string; fireRate: number } | null;
}

/** v0.6 — per-template audit breakdown. */
export interface Template {
  /** Stable identifier derived from URL pattern. e.g. "/listing/:slug" */
  signature: string;
  /** Cluster size in the discovered URL set (NOT the audit sample). */
  totalUrls: number;
  /** Total discovered URLs (denominator for coverage % calculation). */
  totalDiscoveredUrls: number;
  /** URLs actually audited for this template. */
  auditedUrls: string[];
  /** Per-template grade derived from per-URL findings within this template. */
  verdict: Verdict;
  /** Per-template risk score (0-100), independent of site-level risk. */
  risk: number;
  /** Per-template category grades. */
  categories: CategoryGrades;
  /** Variance metric — see spec §5. */
  variance: TemplateVariance;
  /** Finding IDs whose pageUrl is in auditedUrls. Reference, not duplication. */
  findingIds: string[];
}

export interface RuleResult {
  ruleId: string;
  severity: Severity;
  message: string;
  /** What to do about this finding. */
  fix?: string;
  /** Google documentation URL backing this finding. */
  ref?: string;
  /**
   * Marketing-page deeplink for this rule (v0.4+). Always populated by the
   * auditor — points to https://pseolint.dev/rules/{slug} where slug is the
   * rule-id segment after the namespace prefix.
   */
  docsUrl?: string;
  /** Primary page this finding refers to, when applicable. */
  pageUrl?: string;
  /** Other URLs involved (e.g. cluster members, related pairs). */
  relatedUrls?: string[];
  /** Page group this finding belongs to, if page classification is configured. */
  group?: string;
  /** Numeric similarity score (0-1) for pairwise rules. Used by enrichment clustering. */
  similarity?: number;
  /** Structured context attached by the enrichment pipeline. */
  context?: FindingContext;
  /** Fix effort level assigned by the enrichment pipeline. */
  effort?: FixEffort;
  /**
   * v0.4.3 — confidence in this finding. Defaults to `high` when omitted.
   * Set to `low` / `speculative` when the rule is known to false-positive on
   * the audited site's type (e.g. `aeo/citable-facts` on a docs site).
   * Scoring profiles can downweight low-confidence findings; formatters
   * render a caveat in the message.
   */
  confidence?: Confidence;
  /**
   * v0.6 — which template the finding belongs to. Set for per-page rule
   * firings; absent for site-level findings (cluster rules, cross-template
   * rules, audit/* diagnostics).
   */
  template?: string;
  /**
   * v0.5+ change-driven monitoring. True when the finding was carried forward
   * from a prior audit because the page was skipped under monitoring mode (no
   * sitemap-lastmod change, within age floor, no other refetch trigger). The
   * finding has not been re-verified this run.
   */
  carriedForward?: boolean;
  /**
   * v0.5+ change-driven monitoring. ISO timestamp of the last audit that
   * actually re-fetched the page and confirmed this finding fires. Set on
   * carried-forward findings so consumers can reason about staleness.
   */
  lastVerifiedAt?: string;
}

/** v0.4 four-category bucket keys. */
export type CategoryKey = "integrity" | "discoverability" | "citation" | "data" | "audit";

/**
 * The categories that contribute to the verdict — every `CategoryKey` except
 * the weight-0 `audit` diagnostics bucket (every scoring profile sets
 * `audit: 0`). Canonical source of truth for consumers (CLI, MCP, web) that
 * surface "the scored categories" so they don't each hardcode the list.
 * The `satisfies` clause keeps it in sync if a key is ever renamed.
 */
export const SCORED_CATEGORY_KEYS = ["integrity", "discoverability", "citation", "data"] as const satisfies readonly CategoryKey[];

/** Per-category grade + raw issue count. Audit category exists for completeness but is never weighted. */
export interface CategoryGrade {
  grade: Grade;
  issues: number;
}

export type CategoryGrades = Record<CategoryKey, CategoryGrade>;

/** Issues bucketed by severity — the v0.4 replacement for the flat `findings` array. */
export interface IssueBuckets {
  /** Severity = error or critical. Must be fixed before shipping. */
  blockers: RuleResult[];
  /** Severity = warning. Should be fixed before scaling. */
  shouldFix: RuleResult[];
  /** Severity = info. Tracked for trend analysis. */
  informational: RuleResult[];
}

/** Crawl statistics surfaced under diagnostics. */
export interface CrawlStats {
  /** Total URLs the crawler considered (sitemap + discovered links). */
  discovered: number;
  /** URLs the crawler successfully fetched and audited. */
  fetched: number;
  /**
   * URLs the crawler fetched but excluded from the rule pipeline (non-HTML
   * content-type, dedup, robots-disallow, render budget, etc.).
   */
  skipped: number;
}

/** Engine-internal diagnostics — weight 0, never affects verdict. */
export interface Diagnostics {
  /** Origin readiness aggregate (median/p95/error ratio). Null when no live fetches occurred. */
  originReadiness: import("./fetch-observer.js").ReadinessReport | null;
  crawlStats: CrawlStats;
  /**
   * Engine-emitted `audit/*` findings (e.g. `audit/duplicate-url`,
   * `audit/skipped-by-robots`). Always severity=info, never affect the
   * verdict, never appear in `summary.issues`. Surfaced here so consumers
   * (telemetry, debug UIs) can still see what was skipped or deduped.
   */
  auditFindings: RuleResult[];
}

/** Options for HTTP caching during audits. */
export interface CacheOptions {
  /** Directory to store cache files. Default: `.pseolint/cache/`. */
  dir?: string;
  /** TTL for entries without ETag/Last-Modified validators. Default: 7 days. */
  ttlMs?: number;
  /**
   * Maximum total size of the cache directory in bytes. When exceeded after a
   * run, oldest-mtime entries are evicted until under the cap. Also sweeps
   * leftover `.tmp` files from crashed writes. `<= 0` disables size-based
   * eviction. Default: 209_715_200 (200 MB). Filesystem backend only.
   */
  maxBytes?: number;
  /**
   * Custom storage backend; overrides `dir`. Lets a host persist the cache off
   * the (ephemeral) filesystem — e.g. an R2-backed store on serverless. The
   * backend manages its own retention, so `maxBytes` pruning does not apply.
   */
  backend?: import("./cache.js").CacheBackend;
}

/** Cache stats reported at end of audit. */
export interface CacheStats {
  hits: number;
  total: number;
  bytesSavedEstimate: number;
}

/** Options for run state persistence. */
export interface StateOptions {
  /** Path to state file. Default: `.pseolint/state.json`. */
  path?: string;
  /**
   * v0.5+: alias for `mode: "monitoring"`. Kept for back-compat with users who
   * passed `--since` explicitly. Auto-monitoring on prior state existence is
   * the new default and does not require this flag.
   */
  since?: boolean;
  /** If true, exit non-zero when a new rule ID fires on any URL vs prior state. */
  exitOnRegression?: boolean;
  /**
   * v0.5+: monitoring strategy.
   *   "monitoring" — apply the pre-fetch decision matrix (default when prior
   *     state exists). Skipped URLs are NOT fetched; their findings are
   *     carried forward.
   *   "fresh" — fetch every candidate URL even when prior state exists. Still
   *     writes a fresh state file at end of run.
   * When omitted, the auditor picks "monitoring" if prior state exists, else
   * "fresh".
   */
  mode?: "monitoring" | "fresh";
  /**
   * v0.5+: minimum age (in days) since a URL's last fetch before the
   * monitoring matrix forces a re-fetch regardless of other signals. Defends
   * against silently-incorrect skips (e.g. lying sitemap lastmods). Default: 7.
   */
  ageFloorDays?: number;
}

/** Options for local-only telemetry JSONL output. */
export interface TelemetryOptions {
  /** Enable telemetry write at end of audit. Default: false. */
  enabled?: boolean;
  /** Path to JSONL file. Default: `.pseolint/telemetry.jsonl`. */
  path?: string;
  /** Show y/n/skip feedback prompt after triage on TTY. Default: true (when telemetry enabled). */
  prompt?: boolean;
  /** Non-interactive feedback rating — bypasses the prompt (useful in CI). */
  feedback?: "helpful" | "unhelpful";
}

/** Options for AI triage post-processing. */
export interface AiOptions {
  enabled?: boolean;
  /** Provider id, e.g. "anthropic" | "openai" | "google" | "ollama". Any string resolved against the adapter registry. */
  provider?: string;
  model?: string;
  /** Only meaningful for Ollama. Ignored by cloud providers. */
  endpoint?: string;
  apiKey?: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  /** Max estimated USD cost per triage call. Call is refused pre-flight if exceeded. When undefined, no cap. */
  maxCostUsd?: number;
  /** Max estimated USD spent on successful triages per UTC day (read from telemetry). Requires telemetry.enabled. */
  dailyBudgetUsd?: number;
  /** Print one-line discovery hint when an AI key is detected but --ai is not set. Default: true. */
  suggest?: boolean;
  cache?: { ttlMs?: number; dir?: string } | false;
}

export interface AuditSummary {
  /** Schema version (current: "2026-06-v0.6"). Programmatic consumers branch on this; see {@link SCHEMA_VERSION}. */
  schemaVersion: typeof SCHEMA_VERSION;
  /** User-facing verdict ladder. */
  verdict: Verdict;
  /**
   * Internal numeric risk score (0–100, low = good). Retained for CI thresholding,
   * trend deltas, and alert-gate diff logic. NEVER displayed to humans.
   */
  risk: number;
  /** One-liner summarising counts: e.g. "3 ship-blockers, 16 should-fix". */
  headline: string;
  /** Per-category grade + count. */
  categories: CategoryGrades;
  /** Findings bucketed by severity. */
  issues: IssueBuckets;
  /**
   * v0.4 §4.11 — pre-flight site classification. Decides which rules apply
   * based on URL count, template clustering, and framework signal. The
   * `suppressedRules` list is what the rule dispatcher honours. Pass
   * `strict: true` in AuditOptions to keep the classification but force all
   * rules to run anyway.
   */
  siteClassification: import("./site-classifier.js").SiteClassification;
  /**
   * 2026-05-03 calibration credibility: rule IDs whose severity was
   * remapped by the active scoring profile (e.g. `aeo/citable-facts`
   * demoted from `error` to `info` on a `programmatic-directory` site).
   * Empty when no demotions applied. Surfaced to formatters so users can
   * see the engine's reasoning rather than wondering whether the score
   * was gamed. Distinct from `siteClassification.suppressedRules` which
   * tracks `PSEO_ONLY_RULE_IDS` suppression — those rules don't run at
   * all; demoted rules ran and emitted findings, just at lower severity.
   */
  appliedSeverityDemotions?: string[];
  /** Engine-internal diagnostics (origin readiness, crawl stats). Weight 0. */
  diagnostics: Diagnostics;

  groupScores?: Record<string, number>;
  groupPageCounts?: Record<string, number>;
  pageCount: number;
  /**
   * v0.6 — per-template breakdown. Empty array on tiny sites where the
   * classifier reports `unclear` or `small-marketing`; the per-URL
   * findings list (below) carries everything.
   * Additive: old code reading `findings` still works.
   */
  templates: Template[];
  /** True when the enrichment pipeline detects template-generated content. */
  templateDetected?: boolean;
  /** Pre-enrichment finding count, for backward compatibility with CI scripts. */
  rawFindingCount?: number;
  /** Cache statistics when caching is enabled. */
  cacheStats?: CacheStats;
  /** True when --exit-on-regression detected a new rule ID vs prior state. */
  hasRegression?: boolean;
  /**
   * v0.5.12 — URLs actually audited this run (after sampling, dedup, and
   * policy filtering). Used by the calibration --repin mode to snapshot
   * which pages the engine fetched so they can be pinned for future runs.
   * Always sorted for deterministic diffs. Absent when no pages were audited.
   */
  auditedUrls?: string[];
  /**
   * v0.5+: URLs the change-driven monitoring matrix decided to skip pre-fetch
   * (their findings were carried forward from prior state). Pre-v0.5 this
   * field carried URLs whose contentHash matched prior state under `--since`;
   * the new pre-fetch decision replaces that meaning.
   */
  skippedUrls?: string[];
  /**
   * v0.5+: change-driven monitoring summary. Present whenever the auditor ran
   * in monitoring mode (prior state existed and no `--mode=fresh` override).
   * Absent on fresh runs and on filesystem-source audits.
   */
  scrapePlan?: ScrapePlanSummary;
  /** AI triage result when AI is enabled and call succeeded. */
  triage?: import("./ai/types.js").TriageResult;
  /**
   * True when the run did NOT cover the full site. Two causes (see
   * `truncatedKind`): the backpressure watchdog aborted on a degraded origin, OR
   * discovery under-delivered against the site's sitemap (unreachable child
   * sitemaps / far fewer pages fetched than declared). Either way the report
   * carries whatever was collected; consumers MUST treat coverage as partial
   * (counts/verdict are lower bounds). Absent/false on complete runs.
   */
  truncated?: boolean;
  /** Human-readable reason the run was truncated. Present only when `truncated` is true. */
  truncatedReason?: string;
  /**
   * Machine-readable cause of truncation, so consumers/CI can branch:
   *   - `"backpressure"` — the watchdog aborted a degraded-origin crawl mid-flight.
   *   - `"coverage"` — discovery under-delivered vs the declared sitemap.
   * Present only when `truncated` is true.
   */
  truncatedKind?: "backpressure" | "coverage";
  /** Resolved domain authority used to moderate the verdict (0–100), with sources. Absent when unavailable. */
  authority?: { score: number; domain: string };
  /** Resolved content-effort score (0–100) used to moderate the verdict. Absent when not enabled or unavailable. */
  contentEffort?: { score: number };
}

/**
 * v0.5+ change-driven monitoring summary surfaced on AuditSummary so dashboards
 * and CI consumers can show "X/Y URLs re-scraped" without recomputing.
 */
export interface ScrapePlanSummary {
  /**
   * URLs whose bodies actually came back this run. May be lower than
   * `intended` when downstream filters drop URLs (robots disallow, byte
   * budget, content-type, 4xx).
   */
  fetched: number;
  /**
   * URLs the decision matrix marked for refetch. `intended - fetched` =
   * URLs the matrix wanted to fetch but downstream filters dropped.
   */
  intended: number;
  /** URLs whose findings were carried forward from prior state without re-fetching. */
  carriedForward: number;
  /**
   * Counts per matrix reason (`new`, `age`, `ruleset`, `recheck`, `lastmod`,
   * `gsc`, `no-signal`, `unchanged`). Sums to `intended + carriedForward`.
   */
  reasonCounts: Record<string, number>;
  /** CORE_RULESET_VERSION active during this run. */
  rulesetVersion: string;
  /** ISO timestamp of the last full (non-monitoring) audit, or null if never. */
  lastFullAuditAt: string | null;
}

export interface PageGroupConfig {
  /** Glob pattern(s) to match page URLs/paths. */
  match: string | string[];
  /** Rule globs to enable for this group. If omitted, all rules apply. */
  rules?: string[];
  /** Per-rule threshold or severity overrides. Keys are rule IDs. */
  overrides?: Record<string, Record<string, unknown>>;
}

export interface AuditOptions {
  /** When "diff", corpus-scoped rules are skipped (used by hosted diff-audits). Default: "full". */
  mode?: "full" | "diff";
  rules?: {
    /** Passed to `normalizeAuditUrl` for crawl URLs and resolved links (default: strip query, keep www). */
    stripUrlQuery?: boolean;
    stripWwwHost?: boolean;
    nearDuplicateThreshold?: number;
    entitySwapThreshold?: number;
    thinContentMinWords?: number;
    publicationVelocityMaxPerDay?: number;
    /**
     * spam/publication-velocity: corpus-relative ceiling expressed as a fraction (0..1).
     * Effective threshold = max(publicationVelocityMaxPerDay, ceil(corpusSize * fraction)).
     * Lets large sites publish proportionally without tripping the rule, while small/medium
     * sites stay governed by `publicationVelocityMaxPerDay`. Default: 0.10 (10%).
     */
    publicationVelocityMaxPerDayCorpusFraction?: number;
    boilerplateMaxRatio?: number;
    templateDiversityMinUniqueRatio?: number;
    /** content/unique-value density floors. Default { passBelow: 0.20, errorBelow: 0.12 }. */
    uniqueValueDensity?: { passBelow: number; errorBelow: number };
    metaUniquenessMinJaccard?: number;
    linkDepthMaxClicks?: number;
    templateCoverageMinPages?: number;
    /** content/citation-coverage: quantified-claim count that expects a citation. */
    citationCoverageMinClaims?: number;
    /** content/citation-coverage: authoritative-citation floor below which it fires. */
    citationCoverageMinAuthoritative?: number;
    /** content/citation-coverage: extra authoritative domains merged with defaults. */
    citationAllowlist?: readonly string[];
    /** aeo/answer-first: max words in the first paragraph for extractable answer. */
    answerFirstMaxWords?: number;
    /** aeo/citable-facts: below this count, a page errors. */
    citableFactsMin?: number;
    /** aeo/citable-facts: at or above this count, a page passes. */
    citableFactsTarget?: number;
    /** aeo/freshness-signals: days before a dateModified is considered stale. */
    freshnessMaxStaleDays?: number;
    /** aeo/content-modularity: words beyond which a paragraph is flagged. */
    modularityMaxParagraphWords?: number;
    /** aeo/content-modularity: minimum ratio of self-contained sections (0–1). */
    modularityMinSelfContainedRatio?: number;
    /** aeo/faq-coverage: min question-phrased H2s to trigger the check. */
    faqMinQuestionHeadings?: number;
  };
  /** Max parallel HTTP fetches when auditing a remote sitemap (default: 5). */
  concurrency?: number;
  /** Per-request timeout in milliseconds (default: 30000). */
  timeout?: number;
  /** Audit a random subset of N pages. 0 means all pages (default: 0). */
  sampleSize?: number;
  /**
   * URL/path glob patterns to exclude from the audit. v0.4: globs match
   * against the URL pathname only (e.g. "/api/foo"), not the full URL.
   * When `warnUnmatchedIgnore` is true, the auditor logs a per-pattern
   * warning for any pattern that matched zero discovered URLs. Regardless
   * of the flag, if EVERY ignore pattern matched zero URLs, a single
   * consolidated warning is emitted (likely systematic typo).
   */
  ignore?: string[];
  /**
   * v0.4.1: when true, emit a per-pattern warning for each `ignore` glob
   * that matched zero discovered URLs. Default: false (quiet) — config-
   * loaded patterns commonly include broad safety lists like
   * `**\/dashboard\/**` that legitimately don't match a small site. The
   * CLI sets this to true only when `--ignore` was passed explicitly on
   * the command line. The all-zero consolidated warning still fires
   * regardless of this flag.
   */
  warnUnmatchedIgnore?: boolean;
  crawlDiscovery?: boolean;
  /**
   * When true and crawlDiscovery is also true, top the sample budget up to `sampleSize` by
   * following same-origin links from the sitemap-fetched pages (one level deep). Robots.txt
   * Disallow rules are respected. Default: false — keeps sitemap authoritative when a budget is set.
   */
  fillBudgetViaLinkDiscovery?: boolean;
  /**
   * Hard ceiling on the total bytes fetched across all pages in a single audit.
   * When reached, remaining fetches are skipped. Default: 52_428_800 (50 MB).
   * Set to 0 to disable.
   */
  maxFetchBytes?: number;
  /** Page groups with per-group rule sets and threshold overrides. */
  pageGroups?: Record<string, PageGroupConfig>;
  /** Browser rendering options for client-rendered pages. */
  render?: {
    browserWsEndpoint?: string;
    /**
     * How to handle third-party analytics / session-replay beacons during
     * rendered audits.
     *   "block" (default) — abort known analytics hosts so the audit doesn't
     *     inject fake pageviews / sessions into the site owner's dashboards.
     *   "allow-first-party" — block third-party analytics only; same-origin
     *     requests pass through (for sites that self-host analytics).
     *   "allow" — don't intercept anything (only for sites you own).
     */
    analyticsMode?: "block" | "allow" | "allow-first-party";
    /** Extra host tokens to block in addition to the default list. */
    extraBlockedHosts?: readonly string[];
  };
  /** Override template auto-detection. When set, skips heuristic detection. */
  templateGenerated?: boolean;
  /** Custom entity mask patterns. Merged with defaults (US states, ZIP codes). Set to empty array to disable defaults. */
  entityPatterns?: Array<{ placeholder: string; pattern: string; flags?: string }>;
  /** Auto-derive entity-mask patterns from the corpus (default true). Set false to A/B compare. */
  autoEntityMask?: boolean;
  /** Source data records for data-binding verification. */
  dataSource?: DataSourceOptions;
  /** HTTP cache configuration. When omitted, caching is disabled. */
  cache?: CacheOptions;
  /** Sampling strategy when sampleSize < total pages. Default: "stratified". */
  samplingStrategy?: SamplingStrategy;
  /** Max samples per inferred URL template cluster. Caps per-cluster allocation. */
  maxPerTemplate?: number;
  /**
   * Optional integer seed for the stratified-sampler PRNG. When set, repeated
   * audits with the same `sampleSize` and `samplingStrategy` pick the same
   * pages — letting callers (calibration runners, CI gates) get reproducible
   * verdicts. When omitted, the sampler uses `Math.random` (the legacy
   * non-deterministic behavior).
   */
  sampleSeed?: number;
  /**
   * 2026-05-03 v0.5.2 — bring-your-own domain authority score (0-100).
   * pseolint does not measure backlinks/DA itself (deliberate non-feature
   * to keep the engine offline-runnable), but the calibration corpus is
   * biased toward high-authority sites. To prevent the engine's leniency
   * from over-applying to low-authority operators copying high-DA shapes,
   * callers can pass an authority hint:
   *
   *   - `score >= 80` (established brand): verdict shifts ONE TIER UP
   *     (more lenient — acknowledges the site can absorb shapes that
   *     would tank a newer domain)
   *   - `score <= 30` (newer/lower-authority): verdict shifts ONE TIER DOWN
   *     (less lenient — fixing flagged issues is a necessary condition,
   *     not a sufficient one)
   *   - 31..79: no shift (default behavior)
   *
   * The raw `risk` number is NEVER modified by this option — only the
   * user-facing `verdict` mapping shifts. CI gates that key off `risk`
   * stay stable.
   *
   * Omitted = no shift (back-compat).
   */
  authorityScore?: number;
  /** OpenPageRank API key; enables live authority lookup when authorityScore is not supplied. */
  openPageRankApiKey?: string;
  /**
   * Opt-in Chrome UX Report field data for Core Web Vitals. When `apiKey` is
   * set (free CrUX key), the auditor fetches real-user p75 LCP/CLS/INP and the
   * tech/core-web-vitals rule scores against it instead of the lab `--render`
   * measurement — this is the number Google ranks on, and the only source of
   * INP. Off unless a key is provided. Queries stay on Google's fixed CrUX
   * endpoint (no SSRF surface).
   */
  crux?: {
    apiKey: string;
    /** Cap on per-URL CrUX lookups; pages beyond it inherit origin-level field data. Default 150; 0 = unlimited. */
    maxUrlLookups?: number;
    /**
     * Which CrUX form factor to query. Google indexes mobile-first, so `"phone"`
     * is the ranking-relevant view; `"all"` (default) is the aggregate across
     * devices and can mask a poor mobile experience.
     */
    formFactor?: "phone" | "desktop" | "all";
  };
  /** Custom authority provider (overrides the default OPR/CC composite). For tests + offline corpora. */
  authorityProvider?: import("./algorithms/authority/provider.js").AuthorityProvider;
  /**
   * Opt-in content-effort moderation (LLM judge). Off unless provided. When
   * `enabled`, the auditor judges per-template content effort (0-100) via the
   * configured model and lets it shift the verdict one tier in either direction
   * (low effort → stricter, high effort → more lenient). The raw `risk` is
   * never modified — only the user-facing verdict mapping. `model` defaults to
   * `claude-sonnet-4-6`; `cacheDir` defaults to an OS-temp content-hash cache.
   */
  contentEffort?: { enabled: boolean; model?: string; cacheDir?: string };
  /**
   * Pre-resolved 0-100 site content-effort. Calibration/tests inject this to
   * stay offline + deterministic; bypasses the LLM entirely (takes precedence
   * over `contentEffort.enabled`). `null` = absent → moderator no-ops.
   */
  contentEffortScore?: number | null;
  /** Run state persistence. When omitted, no state is written. */
  state?: StateOptions;
  /**
   * v0.5.3 — caller-supplied refetch overrides. Any URL listed in `force.urls`
   * is always re-fetched and short-circuits the monitoring decision matrix
   * (reason: `"watched"`). Owned by the caller (e.g. the web app's per-domain
   * "watched pages" list); the engine treats it as a transient input and never
   * persists it. Watched URLs absent from the discovered sitemap are still
   * audited so the caller learns when a watched page has been removed.
   *
   * **Limitation:** `force.urls` is only honored when the audit runs in
   * monitoring mode against an HTTP source with prior state present. It is
   * silently ignored on filesystem sources and on fresh-mode runs (no prior
   * state file). On a fresh first-ever monitoring run, force-only URLs not
   * present in the sitemap will not be audited — the audit runs against the
   * sitemap-discovered set as usual. Callers who need fresh-mode
   * force-include must crawl the URL via single-page audit instead.
   */
  force?: { urls?: ReadonlyArray<string> };
  /** AI triage options. When omitted or `enabled: false`, no AI is invoked. */
  ai?: AiOptions;
  /** Local-only telemetry (JSONL) options. When omitted or `enabled: false`, no records are written. */
  telemetry?: TelemetryOptions;
  /**
   * External abort signal. When aborted, in-flight fetches are cancelled and
   * `auditSource` throws an `AbortError`. Host code can use this to kill an
   * audit that exceeded a per-user budget or was cancelled by the user.
   */
  signal?: AbortSignal;
  /**
   * When true, every crawled URL's hostname is validated with
   * `validateTargetHost` before fetch — resolves the hostname and rejects if
   * any address is in a private / reserved / link-local / loopback / multicast
   * range. Applies to the source URL, sitemap entries, redirect targets, and
   * discovered links. Defends against SSRF / DNS-rebinding when the library is
   * invoked against user-supplied URLs (e.g. from a hosted audit service).
   * Default: false (CLI users auditing localhost / staging sites should not
   * be broken silently).
   */
  guardSsrf?: boolean;
  /**
   * When true (default), sitemap URLs that match a `Disallow:` rule in the
   * target's robots.txt are skipped at fetch time instead of crawled. Set to
   * false to audit staging / internal sites that Disallow everything.
   */
  respectRobotsTxt?: boolean;
  /**
   * When true (default), pages explicitly marked `noindex` (via
   * `<meta name="robots">` or `X-Robots-Tag` header) are excluded from rule
   * evaluation — the site owner already opted out of SEO indexing for them.
   * The skipped URLs surface in `summary.skippedUrls` with reason `"noindex"`.
   * Set to false to audit them anyway (useful when investigating why a
   * specific page was accidentally noindex'd).
   */
  respectNoindex?: boolean;
  /**
   * When true (default), pages heuristically detected as auth surfaces (login /
   * signup / password reset) are excluded from rule evaluation. Detection
   * requires 2+ signals: `<input type="password">` in a < 200-word body, title
   * matching the auth-page regex (case-insensitive, after stripping brand
   * suffix), or H1 matching the same regex. The 2-signal threshold keeps the
   * false-positive rate ~0 on the calibration corpus. Set to false (CLI:
   * `--no-skip-detected-auth`) to audit auth pages anyway.
   */
  skipDetectedAuth?: boolean;
  /**
   * When true (default), skip pages that look like cookie / legal / consent /
   * imprint boilerplate (title, H1, or URL path matches well-known
   * compliance-page patterns). These exist for legal compliance and are never
   * SEO targets — auditing them produces routine findings the user already
   * knows about. Set to false (CLI: `--no-skip-boilerplate`) to audit them.
   */
  skipBoilerplate?: boolean;
  /**
   * When true (default), skip pages with search-result URL hallmarks (query
   * parameter `q` / `query` / `search` / `s` / `keyword`, or path starting with
   * `/search`). Per Google's own SEO guidance these should be noindex'd but
   * many sites don't tag them; auditing them generates noise. Set to false
   * (CLI: `--no-skip-search-pages`) to audit them.
   */
  skipSearchPages?: boolean;
  /**
   * When true, skip pages that look like un-hydrated SPA shells (body text
   * < 100 chars, script tags present, no substantive noscript fallback).
   * These fail every content rule but the underlying problem is server-side
   * rendering, not content quality. Use --render mode instead. Default: false
   * (opt-in via `--skip-empty-body`) — its lone corpus hit is a listing
   * homepage the parser under-extracts, a borderline false positive.
   */
  skipEmptyBody?: boolean;
  /**
   * Preset that flips several safety options at once.
   *   "saas" — intended for hosted services auditing user-submitted URLs:
   *     guardSsrf=true, respectRobotsTxt=true, tighter maxFetchBytes cap,
   *     followRedirects stays true (audits need final URL).
   *   "cli"  — intended for local CLI / dev use:
   *     guardSsrf=false (auditing localhost is OK), respectRobotsTxt=true,
   *     default caps.
   *   "dev"  — tiny crawl budget for localhost probing: concurrency=1,
   *     sampleSize=25, maxCrawlDiscovered=50. Designed so a cache-cold
   *     `pseolint http://localhost:3000` doesn't thundering-herd a dev DB.
   *     Auto-selected on localhost sources unless `autoDevPreset: false`.
   * Individual options on AuditOptions override the preset when set.
   * Default: undefined (no preset applied, existing opt-in behaviour).
   */
  safeMode?: SafeMode;
  /**
   * When true (default), audit sources pointing at localhost / private
   * networks are auto-promoted to the `dev` safeMode preset. Set to false
   * to opt out (e.g. `--full` on the CLI). Explicit `safeMode` beats this.
   */
  autoDevPreset?: boolean;
  /**
   * Hard ceiling on URLs discovered via link-following before sampling.
   * Protects against malicious sites with many self-links that could extend
   * the crawl up to the byte budget. Default: 5000.
   */
  maxCrawlDiscovered?: number;
  /**
   * When false, 3xx responses are returned as-is (the audit will see the
   * redirect location header and can report it) instead of followed. Useful
   * for security-sensitive audits that must not leave the exact submitted
   * URL. Default: true.
   */
  followRedirects?: boolean;
  /**
   * When false, disables the in-flight backpressure watchdog that aborts the
   * audit when origin latency / 5xx rate spikes past thresholds during the
   * crawl. On by default; the last line of defence against a cache-cold
   * origin ballooning an audit into an expensive egress event.
   */
  backpressure?: boolean;
  /**
   * v0.4 §4.11 — when true, the site classifier still runs and `summary.siteClassification`
   * is populated, but `suppressedRules` is forced to `[]` so every rule executes
   * regardless of detected site type. Use this to inspect what the classifier
   * sees on a site that would otherwise have pSEO-only rules suppressed.
   * Default: false.
   */
  strict?: boolean;
  /**
   * v0.5.12 — pinned URL list for stable calibration. When provided and
   * non-empty, the auditor SKIPS sitemap discovery + random sampling
   * entirely and audits ONLY these URLs. Used by the reputable-pSEO
   * calibration corpus to remove run-to-run variance from page selection.
   *
   * Distinct from `force.urls` (line 552): force.urls SUPPLEMENTS the
   * sample with caller-curated URLs; pinnedUrls REPLACES the sample.
   *
   * Filesystem sources: pinnedUrls are interpreted as relative paths;
   * URL sources: pinnedUrls must be absolute and same-origin as the
   * source URL (validated; throws if any URL is cross-origin).
   *
   * When pinnedUrls is set, `sampleSize` is ignored (the cap IS the array).
   */
  pinnedUrls?: ReadonlyArray<string>;
  /**
   * v0.6.1 — caller-supplied URL list for site classification + template
   * detection. When provided, the classifier and `detectTemplates` use THIS
   * list instead of the sitemap-discovered or pinned-URL set. Audit phase
   * still runs against `pinnedUrls` (or sitemap-sampled URLs).
   *
   * Use case: calibration fixtures. Pinned URLs limit the audit to 25 per
   * site for cost, but the classifier needs to see the site's TRUE scale
   * to land on `programmatic-directory` and trigger v0.6 template-aware
   * verdicts. Pass the full sitemap URL list here without auditing every
   * one of them.
   *
   * Distinct from `pinnedUrls` (which dictates the audit set) and
   * `force.urls` (which supplements the audit set in monitoring mode).
   */
  classifierUrls?: ReadonlyArray<string>;
}

export type SafeMode = "saas" | "cli" | "dev";

export type SamplingStrategy = "stratified" | "random";

/** A single page's source data for data-source comparison. */
export interface PageDataRecord {
  /** URL or path pattern to match against audited pages. Supports globs. */
  url: string;
  /** Key-value data that should appear on the rendered page. */
  data: Record<string, unknown>;
}

/** Options for data-source comparison rules. */
export interface DataSourceOptions {
  /** Path to JSON file or inline array of page data records. */
  records: PageDataRecord[];
}

export interface EntityMaskPattern {
  placeholder: string;
  pattern: RegExp;
}

export interface HttpMeta {
  statusCode: number;
  finalUrl: string;
  redirectChain: string[];
  xRobotsTag: string;
  linkHeader: string;
  /**
   * v0.4: lower-cased response headers. Populated for the source URL only
   * (used by the dev-server framework detector). Other crawled pages can
   * leave this undefined to keep the audit memory-bounded.
   */
  headers?: Record<string, string>;
}

export interface ParsedPage {
  url: string;
  /** Page title, scoped to `<head> > title`. Empty when no head title exists. */
  title: string;
  /**
   * Where `title` came from. `"head"` = a real `<head> > title`. `"none"` = no
   * head title element (so `title` is empty). Used by the title-uniqueness rule
   * to diagnose the SVG-`<title>` trap: a missing head title where an inline SVG
   * `<title>` would otherwise masquerade as the page title to naive extractors.
   */
  titleSource?: "head" | "none";
  /**
   * First inline SVG `<title>` text found when the head title is missing. Lets the
   * title-uniqueness rule say "no <head><title>; an SVG <title> (\"Spotify\") was
   * found instead" rather than just reporting a shared/empty title. Absent when a
   * head title exists or no SVG title is present.
   */
  svgTitleSample?: string;
  metaDescription: string;
  canonical: string;
  robotsMeta: string;
  og: {
    title: string;
    description: string;
    image: string;
  };
  hreflangs: Array<{
    lang: string;
    href: string;
  }>;
  headings: {
    h1: string[];
    h2: string[];
  };
  /**
   * Resolved `a[href]` targets. For HTTP(S) page URLs, only `http:` / `https:` targets are kept
   * (`javascript:`, `data:`, etc. are dropped). For filesystem page URLs, paths are normalized.
   */
  resolvedHrefs: string[];
  publishedDate?: string;
  structureSignature: string;
  jsonLd: unknown[];
  authorSignals: {
    metaAuthor: string;
    schemaAuthor: boolean;
    bylineElement: boolean;
    relAuthorLink: boolean;
  };
  contentText: string;
  html: string;
  /** Post-hydration DOM (page.content()) when audited with --render; absent in static mode. */
  renderedHtml?: string;
  /**
   * Core Web Vitals captured during --render. Absent in static mode.
   * ponytail: lab snapshot under headless Chromium (LCP/CLS to networkidle),
   * NOT real-user field data (CrUX). Catches gross regressions, not the exact
   * number Google scores. INP is omitted — it needs real interaction a passive
   * crawl can't produce. Upgrade path: ingest CrUX/PageSpeed field data if
   * callers need the number Search Console shows.
   */
  webVitals?: WebVitals;
  /**
   * Real-user Core Web Vitals from CrUX. Absent unless a CrUX API key is
   * supplied (`crux` option / `--crux-api-key`). When present, the
   * tech/core-web-vitals rule prefers this over the lab `webVitals` — it's the
   * field data Google ranks on, and it's the only source of INP.
   */
  fieldVitals?: FieldVitals;
  httpMeta?: HttpMeta;
}

export interface WebVitals {
  /** Largest Contentful Paint, ms. null when no LCP entry was observed. */
  lcp: number | null;
  /** Cumulative Layout Shift, unitless. Accumulated up to networkidle. */
  cls: number | null;
  /** Time to First Byte, ms (navigation timing responseStart). */
  ttfb: number | null;
}

/**
 * Real-user Core Web Vitals from the Chrome UX Report (CrUX) — the p75 values
 * Google actually ranks on, including INP (unmeasurable in a passive crawl).
 * Populated only when a CrUX API key is supplied. `source` distinguishes a
 * precise per-URL reading from an origin-level fallback (used when the specific
 * URL has too little traffic to have its own field data).
 */
export interface FieldVitals {
  /** p75 Largest Contentful Paint, ms. null when CrUX has no LCP for this key. */
  lcp: number | null;
  /** p75 Cumulative Layout Shift, unitless. */
  cls: number | null;
  /** p75 Interaction to Next Paint, ms. */
  inp: number | null;
  /** "url" = this exact URL's field data; "origin" = site-level fallback. */
  source: "url" | "origin";
}
