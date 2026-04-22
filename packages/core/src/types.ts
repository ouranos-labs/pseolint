export type Severity = "info" | "warning" | "error" | "critical";

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
}

export interface CategoryScores {
  spam: number;
  content: number;
  aeo: number;
  links: number;
  tech: number;
  schema: number;
  cannibal: number;
}

/** Options for HTTP caching during audits. */
export interface CacheOptions {
  /** Directory to store cache files. Default: `.pseolint/cache/`. */
  dir?: string;
  /** TTL for entries without ETag/Last-Modified validators. Default: 7 days. */
  ttlMs?: number;
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
  /** If true, audit only URLs with changed/new contentHash since prior state. */
  since?: boolean;
  /** If true, exit non-zero when a new rule ID fires on any URL vs prior state. */
  exitOnRegression?: boolean;
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
  score: number;
  categoryScores: CategoryScores;
  groupScores?: Record<string, number>;
  groupPageCounts?: Record<string, number>;
  pageCount: number;
  findings: RuleResult[];
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
    /** Minimum pages in one directory before hub/index coverage is required. */
    hubPagesMinSiblings?: number;
    /** Skip hub/index checks when a directory has more than this many pages (e.g. large blogs). */
    hubPagesMaxSiblings?: number;
    titleOverlapThreshold?: number;
    keywordCollisionMinShared?: number;
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
  /** URL/path glob patterns to exclude from the audit. */
  ignore?: string[];
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
}

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
