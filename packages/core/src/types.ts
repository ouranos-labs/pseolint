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

/** Top-level v0.4 schema version. Bumps on every breaking output change. */
export const SCHEMA_VERSION = "2026-04-v0.4";

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
   * eviction. Default: 209_715_200 (200 MB).
   */
  maxBytes?: number;
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
  /** Schema version. v0.4 = "2026-04-v0.4". Wave 2 / 3 consumers branch on this. */
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
  /** Engine-internal diagnostics (origin readiness, crawl stats). Weight 0. */
  diagnostics: Diagnostics;

  groupScores?: Record<string, number>;
  groupPageCounts?: Record<string, number>;
  pageCount: number;
  /** True when the enrichment pipeline detects template-generated content. */
  templateDetected?: boolean;
  /** Pre-enrichment finding count, for backward compatibility with CI scripts. */
  rawFindingCount?: number;
  /** Cache statistics when caching is enabled. */
  cacheStats?: CacheStats;
  /** True when --exit-on-regression detected a new rule ID vs prior state. */
  hasRegression?: boolean;
  /** URLs that were skipped because their contentHash matched prior state. */
  skippedUrls?: string[];
  /** AI triage result when AI is enabled and call succeeded. */
  triage?: import("./ai/types.js").TriageResult;
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
    boilerplateMaxRatio?: number;
    templateDiversityMinUniqueRatio?: number;
    uniqueValueMinWords?: number;
    metaUniquenessMinJaccard?: number;
    linkDepthMaxClicks?: number;
    templateCoverageMinPages?: number;
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
  /** Source data records for data-binding verification. */
  dataSource?: DataSourceOptions;
  /** HTTP cache configuration. When omitted, caching is disabled. */
  cache?: CacheOptions;
  /** Sampling strategy when sampleSize < total pages. Default: "stratified". */
  samplingStrategy?: SamplingStrategy;
  /** Max samples per inferred URL template cluster. Caps per-cluster allocation. */
  maxPerTemplate?: number;
  /** Run state persistence. When omitted, no state is written. */
  state?: StateOptions;
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
   * When true, pages heuristically detected as auth surfaces (login / signup /
   * password reset) are excluded from rule evaluation. Detection requires 2+
   * signals: `<input type="password">` in a < 200-word body, title matching
   * the auth-page regex (case-insensitive, after stripping brand suffix), or
   * H1 matching the same regex. Default: false (CLI runs unchanged; the
   * hosted web form turns this on so end-user audits aren't polluted by auth
   * pages at unconventional URLs like `/account` or `/portal`).
   */
  skipDetectedAuth?: boolean;
  /**
   * When true, skip pages that look like cookie / legal / consent / imprint
   * boilerplate (title, H1, or URL path matches well-known compliance-page
   * patterns). These exist for legal compliance and are never SEO targets —
   * auditing them produces routine findings the user already knows about.
   * Default: false on the CLI; the hosted web form turns this on.
   */
  skipBoilerplate?: boolean;
  /**
   * When true, skip pages with search-result URL hallmarks (query parameter
   * `q` / `query` / `search` / `s` / `keyword`, or path starting with
   * `/search`). Per Google's own SEO guidance these should be noindex'd but
   * many sites don't tag them; auditing them generates noise. Default: false
   * on the CLI.
   */
  skipSearchPages?: boolean;
  /**
   * When true, skip pages that look like un-hydrated SPA shells (body text
   * < 100 chars, script tags present, no substantive noscript fallback).
   * These fail every content rule but the underlying problem is server-side
   * rendering, not content quality. Use --render mode instead. Default: false
   * on the CLI.
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
  title: string;
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
  httpMeta?: HttpMeta;
}
