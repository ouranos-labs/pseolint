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
}

export interface CategoryScores {
  spam: number;
  content: number;
  links: number;
  tech: number;
  schema: number;
  cannibal: number;
}

export interface AuditSummary {
  score: number;
  categoryScores: CategoryScores;
  groupScores?: Record<string, number>;
  groupPageCounts?: Record<string, number>;
  pageCount: number;
  findings: RuleResult[];
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
  };
  /** Max parallel HTTP fetches when auditing a remote sitemap (default: 5). */
  concurrency?: number;
  /** Per-request timeout in milliseconds (default: 30000). */
  timeout?: number;
  /** Audit a random subset of N pages. 0 means all pages (default: 0). */
  sampleSize?: number;
  /** URL/path glob patterns to exclude from the audit. */
  ignore?: string[];
  /** Page groups with per-group rule sets and threshold overrides. */
  pageGroups?: Record<string, PageGroupConfig>;
  /** Browser rendering options for client-rendered pages. */
  render?: {
    browserWsEndpoint?: string;
  };
}

export interface EntityMaskPattern {
  placeholder: string;
  pattern: RegExp;
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
}
