/**
 * v0.4 Site Classifier — runs BEFORE rules to gate which rule set applies.
 *
 * Today the engine runs every rule against every audited site regardless of
 * whether the site is actually programmatic-SEO. A 23-page marketing site
 * gets pSEO-targeted findings that don't apply; a 50,000-page directory
 * gets the same audit shape as a small blog. This pre-flight classifier
 * decides which "kind" of site we're auditing and emits a list of ruleIds
 * that the dispatcher will skip when site type is small-marketing/blog.
 *
 * Heuristics (v1, ships in v0.4):
 *   - Sitemap URL count: <50 = bias small/blog; ≥1000 = bias programmatic.
 *   - URL-pattern clustering: normalize numeric/slug segments; if top-3
 *     templates cover ≥60% of URLs → strong programmatic signal.
 *   - Framework signal: pass-through from dev-server detection.
 *
 * Deferred to v0.4.1+ (per spec §4.11):
 *   - DOM-skeleton hashing across pages.
 *   - Per-cluster classification (mixed pSEO + marketing).
 *   - Per-page applicability tagging on findings.
 */

export type SiteType =
  | "programmatic-directory"
  | "small-marketing"
  | "blog"
  | "ecommerce"
  | "docs"
  | "unclear";

export type ClassificationSignal =
  | { kind: "sitemap-url-count"; value: number }
  | {
      kind: "url-pattern-cluster-coverage";
      topTemplate: string;
      pages: number;
      ratio: number;
    }
  | { kind: "framework-detected"; value: "nextjs" | "vite" | "astro" | "unknown" }
  /**
   * v0.5.3 — emitted when `applyDegenerationGuard` downgrades a
   * `small-marketing` or `blog` classification to `unclear` because the
   * corpus is degenerate (mostly thin / mostly identical titles). Surfacing
   * this in `signals` lets the UI explain why severity demotions didn't
   * apply.
   */
  | { kind: "degeneration-guard-tripped"; reason: "median-thin" | "title-duplicate-heavy"; value: number };

export interface SiteClassification {
  type: SiteType;
  /** 0–1 confidence. Below 0.6 → treat as `unclear` and run all rules. */
  confidence: number;
  /** Ordered observations that fed the classification. UI surfaces these. */
  signals: ClassificationSignal[];
  /**
   * RuleIds suppressed because of this classification. The dispatcher
   * checks this list before invoking each rule.
   *
   * Empty array when type is `programmatic-directory`, `ecommerce`, or
   * `unclear` — those run all rules.
   */
  suppressedRules: string[];
}

/** Rules suppressed for non-pSEO sites (small-marketing / blog). */
export const PSEO_ONLY_RULE_IDS: readonly string[] = [
  "spam/template-coverage",
  "spam/template-diversity",
  "spam/entity-swap",
  "cannibal/url-pattern",
  "links/host-section-divergence",
  "content/citation-coverage",
];

/**
 * Normalize a pathname into a hashable template by replacing path segments
 * that look like values with type placeholders.
 *
 * Examples:
 *   /california/los-angeles/plumbers   → /:slug/:slug/:slug
 *   /blog/hello-world                  → /blog/:slug
 *   /post/12345                        → /post/:n
 *   /                                  → /
 */
export function normalizePathToTemplate(pathname: string): string {
  // Drop trailing slash for consistency, but keep "/" itself.
  let p = pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (!p.startsWith("/")) p = "/" + p;

  const segments = p.split("/").slice(1); // drop leading empty
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "")) {
    return "/";
  }

  const out: string[] = segments.map((seg) => {
    if (seg === "") return "";
    // Pure numeric segment.
    if (/^\d+$/.test(seg)) return ":n";
    // Slug-like: lowercase letters/digits/hyphens with at least one
    // hyphen-separated multi-word structure (e.g. "los-angeles",
    // "hello-world"). Pure single-word segments like "about", "blog",
    // "tools" are kept as literals so collection roots don't collide
    // with their detail-page templates.
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(seg)) {
      return ":slug";
    }
    // Long lowercase letter-only segments (>= 12 chars) are treated as
    // slugs even without hyphens — covers concatenated-word URLs like
    // /chicagoplumbers without hyphens.
    if (seg.length >= 12 && /^[a-z]+$/.test(seg)) {
      return ":slug";
    }
    return seg;
  });

  return "/" + out.join("/");
}

/** Extract a normalized pathname from a URL string (or raw path). */
function urlToPath(url: string): string | null {
  try {
    return new URL(url).pathname || "/";
  } catch {
    if (typeof url === "string" && url.length > 0) {
      const path = url.split("?")[0].split("#")[0];
      return path.startsWith("/") ? path : `/${path}`;
    }
    return null;
  }
}

/** Convert a URL string to its template path (no host, no query). */
function urlToTemplate(url: string): string | null {
  try {
    const u = new URL(url);
    return normalizePathToTemplate(u.pathname);
  } catch {
    // Treat as a raw path.
    if (typeof url === "string" && url.length > 0) {
      const path = url.split("?")[0].split("#")[0];
      return normalizePathToTemplate(path);
    }
    return null;
  }
}

/** Compute template-cluster ratios from a URL list. Returns top entries first. */
export function clusterUrlTemplates(urls: string[]): Array<{ template: string; count: number; ratio: number }> {
  const counts = new Map<string, number>();
  let total = 0;
  for (const url of urls) {
    const t = urlToTemplate(url);
    if (t === null) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return [];
  const entries = Array.from(counts.entries()).map(([template, count]) => ({
    template,
    count,
    ratio: count / total,
  }));
  entries.sort((a, b) => b.count - a.count || a.template.localeCompare(b.template));
  return entries;
}

export interface ClassifySiteInput {
  /** All discovered URLs (sitemap + crawl). Unfiltered. */
  urls: string[];
  /** Framework detected via dev-server response headers, if any. */
  framework?: "nextjs" | "vite" | "astro" | "unknown";
}

/**
 * v0.4.3 — common docs path prefixes. Match is case-insensitive and exact
 * on the FIRST path segment (so `/docs/...` matches but a stray `/somethingdocs`
 * does not). Tuned to the docs frameworks we see most: Docusaurus, Nextra,
 * GitBook, MkDocs, VuePress, mintlify, fumadocs, Astro Starlight.
 */
const DOCS_PATH_PREFIXES: readonly string[] = [
  "/docs",
  "/doc",
  "/documentation",
  "/api",
  "/api-docs",
  "/api-reference",
  "/reference",
  "/guide",
  "/guides",
  "/learn",
  "/tutorials",
  "/manual",
  "/handbook",
];

/**
 * v0.4.3 — common ecommerce path prefixes. Same matching rules as docs:
 * case-insensitive, anchored at the FIRST path segment.
 */
const ECOMMERCE_PATH_PREFIXES: readonly string[] = [
  "/products",
  "/product",
  "/collections",
  "/collection",
  "/shop",
  "/store",
  "/cart",
  "/checkout",
  "/category",
  "/categories",
  "/p", // Shopify shortlink convention
];

function firstSegmentMatches(pathname: string, prefixes: readonly string[]): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  const first = `/${segments[0].toLowerCase()}`;
  return prefixes.includes(first);
}

/** Ratio of URLs whose first path segment matches one of `prefixes`. */
function pathPrefixRatio(urls: string[], prefixes: readonly string[]): number {
  if (urls.length === 0) return 0;
  let hits = 0;
  let total = 0;
  for (const u of urls) {
    const path = urlToPath(u);
    if (path === null) continue;
    total += 1;
    if (firstSegmentMatches(path, prefixes)) hits += 1;
  }
  if (total === 0) return 0;
  return hits / total;
}

/**
 * v0.4.3 — docs site detection. A site is `docs` when its URL distribution
 * is dominated by docs-shaped path prefixes:
 *   - 50+ URLs total (docs sites are not tiny — guard against false-positives
 *     on a 5-page marketing site with one /docs link)
 *   - ≥ 60% of URLs sit under a docs prefix
 * Returns `null` when not enough evidence; otherwise the SiteClassification.
 */
function tryClassifyDocs(
  urls: string[],
  signals: ClassificationSignal[],
): SiteClassification | null {
  if (urls.length < 50) return null;
  const ratio = pathPrefixRatio(urls, DOCS_PATH_PREFIXES);
  if (ratio < 0.6) return null;
  let confidence = 0.7;
  if (ratio >= 0.75) confidence = 0.85;
  if (ratio >= 0.9) confidence = 0.92;
  if (urls.length >= 200) confidence = Math.min(0.95, confidence + 0.03);
  return { type: "docs", confidence, signals, suppressedRules: [] };
}

/**
 * v0.4.3 — ecommerce site detection. Two paths to a positive classification:
 *   - URL count ≥ 50 AND ≥ 70% of URLs match /products/* or /collections/*
 *     (high-confidence: this is the canonical Shopify/Woo URL shape)
 *   - URL count ≥ 100 AND ≥ 50% match a broader ecommerce-shaped prefix
 *     (looser fallback for sites that mix /shop, /store, /category)
 * Returns `null` when not enough evidence.
 */
function tryClassifyEcommerce(
  urls: string[],
  signals: ClassificationSignal[],
): SiteClassification | null {
  if (urls.length < 50) return null;
  const productsRatio = pathPrefixRatio(urls, ["/products", "/collections"]);
  if (productsRatio >= 0.7) {
    const confidence = productsRatio >= 0.85 ? 0.92 : 0.85;
    return { type: "ecommerce", confidence, signals, suppressedRules: [] };
  }
  const broadRatio = pathPrefixRatio(urls, ECOMMERCE_PATH_PREFIXES);
  if (broadRatio >= 0.5 && urls.length >= 100) {
    const confidence = broadRatio >= 0.7 ? 0.85 : 0.75;
    return { type: "ecommerce", confidence, signals, suppressedRules: [] };
  }
  return null;
}

/**
 * Locale-code regex for the FIRST path segment. Matches BCP-47-shaped slugs:
 * `/en`, `/de`, `/en-us`, `/zh-hant`, `/pt-br`, etc. Two-letter language code
 * with optional two-letter region. Lowercase only — sites that uppercase
 * locale codes are rare; we don't normalize.
 */
const LOCALE_SEGMENT_REGEX = /^[a-z]{2}(?:-[a-z]{2})?$/;

function isLocalizedRoot(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  return LOCALE_SEGMENT_REGEX.test(segments[0]);
}

/** Ratio of URLs whose first path segment looks like a locale code. */
function localizedRatio(urls: string[]): number {
  if (urls.length === 0) return 0;
  let hits = 0;
  let total = 0;
  for (const u of urls) {
    const path = urlToPath(u);
    if (path === null) continue;
    total += 1;
    if (isLocalizedRoot(path)) hits += 1;
  }
  if (total === 0) return 0;
  return hits / total;
}

/**
 * v0.4.3-rc2 — localized-marketing detector. Stripe, Vercel, Linear, Cloudflare
 * etc. publish each marketing page under multiple `/[lang]/` prefixes. Their
 * sitemap looks like a programmatic directory to the size+cluster heuristic
 * (10k+ URLs all matching `/:slug/:slug` after normalization), but they are
 * NOT pSEO sites — they're high-quality marketing sites with i18n.
 *
 * Signal: ≥30% of URLs have a first segment that matches `/[a-z]{2}(-[a-z]{2})?/`.
 * Returns small-marketing with 0.75 confidence (lower than ecommerce/docs
 * because some localized pSEO directories DO exist — we'd rather under-classify
 * here than mis-suppress real spam findings).
 */
function tryClassifyLocalizedMarketing(
  urls: string[],
  signals: ClassificationSignal[],
): SiteClassification | null {
  const ratio = localizedRatio(urls);
  if (ratio < 0.3) return null;
  // Higher confidence when the locale prefix dominates AND the site isn't
  // ALSO matching the docs/ecommerce shape underneath the locale (those
  // would have caught it earlier — by reaching this point we know it's
  // generic marketing).
  let confidence = 0.75;
  if (ratio >= 0.5) confidence = 0.82;
  if (ratio >= 0.7) confidence = 0.88;
  return {
    type: "small-marketing",
    confidence,
    signals,
    suppressedRules: [...PSEO_ONLY_RULE_IDS],
  };
}

/**
 * Classify a site from its URL list + framework signal. Pure function.
 *
 * Contract: callers must pass the FULL discovered URL list (sitemap +
 * crawl), not the post-sample list. The classifier needs the raw size
 * signal to distinguish a 5000-page directory from a 25-page sample of one.
 */
export function classifySite(input: ClassifySiteInput): SiteClassification {
  const urls = Array.isArray(input.urls) ? input.urls : [];
  const framework = input.framework ?? "unknown";

  const signals: ClassificationSignal[] = [];
  signals.push({ kind: "sitemap-url-count", value: urls.length });

  const clusters = clusterUrlTemplates(urls);
  const top = clusters[0];
  const top3Ratio = clusters.slice(0, 3).reduce((sum, c) => sum + c.ratio, 0);
  if (top) {
    signals.push({
      kind: "url-pattern-cluster-coverage",
      topTemplate: top.template,
      pages: top.count,
      ratio: top.ratio,
    });
  }
  signals.push({ kind: "framework-detected", value: framework });

  // Empty list → unclear (no signal to act on).
  if (urls.length === 0) {
    return { type: "unclear", confidence: 0, signals, suppressedRules: [] };
  }

  // v0.4.3 — try the new high-confidence URL-shape detectors first. These
  // override the legacy size-based heuristics when they fire because URL
  // shape is a stronger signal than raw URL count. Order matters:
  //   1. ecommerce — strongest signal first; /products/* and /collections/*
  //      are an extremely specific URL shape that doesn't occur elsewhere.
  //   2. docs — /docs/*, /api/*, /reference/* are nearly as specific.
  //   3. localized-marketing — /[lang]/ first segment indicates i18n marketing
  //      (stripe.com, vercel.com, etc.) which v0.4.3-rc1 mis-classified as
  //      programmatic-directory because the localized URL count tripped the
  //      ≥1000 URL + ≥60% top-3 cluster heuristic.
  // After all three fail, fall through to the legacy size-clustering logic.
  const ecommerce = tryClassifyEcommerce(urls, signals);
  if (ecommerce) return ecommerce;

  const docs = tryClassifyDocs(urls, signals);
  if (docs) return docs;

  const localized = tryClassifyLocalizedMarketing(urls, signals);
  if (localized) return localized;

  // Step 4: synthesize.
  let type: SiteType = "unclear";
  let confidence = 0;

  // v0.4.3-rc3 — lowered programmatic-directory threshold from 1000 → 500
  // after dogfood showed softschools.com (955 URLs, real pSEO directory)
  // missing the cutoff and classifying as `unclear`. Rebalanced confidence:
  //   ≥ 1000 URLs + top3≥60% template ratio → 0.9
  //   ≥ 500 URLs + top3≥70% template ratio → 0.78 (slightly lower confidence
  //     because the smaller sample is noisier, but still well above the
  //     0.7 profile-application cutoff)
  if (urls.length >= 1000) {
    if (top3Ratio >= 0.6) {
      type = "programmatic-directory";
      confidence = 0.9;
    } else {
      // Lots of pages but no clear template clustering — likely ecommerce
      // (varied product URLs) or a sprawling content site.
      type = "ecommerce";
      confidence = 0.6;
    }
  } else if (urls.length >= 500 && top3Ratio >= 0.7) {
    type = "programmatic-directory";
    confidence = 0.78;
  } else if (urls.length < 50) {
    // Small site. Detect blog separately from generic small-marketing.
    //
    // Note on clustering for tiny sites: in our normalization, top-level
    // pages like /about, /pricing, /contact all collapse to /:slug, so
    // ratio-based clustering misfires below ~10 URLs. We require the top
    // template to be deeper than one segment (so /:slug doesn't trigger)
    // before treating clustering as a programmatic signal at small scale.
    const blogTemplate = clusters.find((c) =>
      c.template.startsWith("/blog/") || c.template === "/blog" || c.template === "/blog/:slug",
    );
    const topIsDeepCluster =
      top !== undefined &&
      top.template.split("/").filter(Boolean).length >= 2 &&
      top.ratio >= 0.6;
    if (blogTemplate && blogTemplate.ratio >= 0.4) {
      type = "blog";
      confidence = 0.85;
    } else if (!topIsDeepCluster) {
      // Tiny site without a deep dominant template — marketing pages.
      type = "small-marketing";
      confidence = 0.85;
    } else {
      // Tiny site WITH a deep dominant template — likely a templated
      // micro-site (rare, but possible). Don't claim it's pSEO from such a
      // tiny sample. Keep `unclear` so all rules run; the rules themselves
      // will decide.
      type = "unclear";
      confidence = 0.5;
    }
  } else {
    // Medium tier (50–999 URLs). Use clustering to decide.
    if (top3Ratio >= 0.6) {
      type = "programmatic-directory";
      confidence = 0.7;
    } else {
      // No clear pattern in the medium tier. Could be marketing site or
      // mid-sized content. Default to unclear so we don't over-suppress.
      type = "unclear";
      confidence = 0.5;
    }
  }

  // Framework-aware nudge: a small Next.js site is almost certainly a
  // marketing or blog site, not a pSEO directory. We've already excluded
  // pSEO via the size check, so this is mostly a confidence bump.
  if (framework === "nextjs" && urls.length < 50 && (type === "small-marketing" || type === "blog")) {
    confidence = Math.min(0.95, confidence + 0.05);
  }

  const suppressedRules =
    type === "small-marketing" || type === "blog" ? [...PSEO_ONLY_RULE_IDS] : [];

  return { type, confidence, signals, suppressedRules };
}

/**
 * v0.5.3 — corpus-quality guard against "small-marketing" / "blog"
 * classification masking degenerate sites. The `small-marketing` profile
 * demotes `spam/thin-content`, `aeo/citable-facts`, `aeo/freshness-signals`,
 * `spam/doorway-pattern` etc. to `info` to avoid false-positives on legit
 * 6-page marketing sites (linear.app etc). But a 6-page site with 0 unique
 * content per page (e.g. an un-translated language switcher pretending to be
 * a directory) trips the same shape and inherits the demotions, escaping
 * with grade B.
 *
 * This guard runs AFTER classification, with parsed-page stats. If the
 * corpus is degenerate (median word count < 50 OR ≥50% of pages share an
 * identical title), the classification is downgraded to `unclear` so the
 * demotion table doesn't apply — the natural rule severities then fire.
 *
 * Only `small-marketing` and `blog` are guarded. The other types either
 * already run all rules (`unclear`, `programmatic-directory`, `ecommerce`,
 * `docs`) or aren't reached by the small-corpus path.
 */
export function applyDegenerationGuard(
  classification: SiteClassification,
  corpusStats: { medianWordCount: number; identicalTitleRatio: number; pageCount: number },
): SiteClassification {
  if (classification.type !== "small-marketing" && classification.type !== "blog") {
    return classification;
  }
  if (corpusStats.pageCount === 0) return classification;

  const isThin = corpusStats.medianWordCount < 50;
  // Require ≥4 pages so a 2-page marketing site with two same-titled drafts
  // doesn't false-positive. Tunable; bestfirenze.com has 6 pages, all with
  // the same homepage content.
  const isTitleDuplicateHeavy =
    corpusStats.identicalTitleRatio >= 0.5 && corpusStats.pageCount >= 4;

  if (!isThin && !isTitleDuplicateHeavy) return classification;

  const reason: "median-thin" | "title-duplicate-heavy" = isThin
    ? "median-thin"
    : "title-duplicate-heavy";
  const value = isThin ? corpusStats.medianWordCount : corpusStats.identicalTitleRatio;

  return {
    type: "unclear",
    confidence: 0,
    signals: [...classification.signals, { kind: "degeneration-guard-tripped", reason, value }],
    suppressedRules: [],
  };
}

/**
 * Compute the corpus stats `applyDegenerationGuard` consumes. Pulled out so
 * tests can pass a fixture stat block directly without constructing
 * `ParsedPage` instances.
 */
export function corpusStatsFromPages(pages: ReadonlyArray<{ title: string; contentText: string }>): {
  medianWordCount: number;
  identicalTitleRatio: number;
  pageCount: number;
} {
  if (pages.length === 0) {
    return { medianWordCount: 0, identicalTitleRatio: 0, pageCount: 0 };
  }
  const wordCounts = pages
    .map((p) => p.contentText.split(/\s+/).filter(Boolean).length)
    .sort((a, b) => a - b);
  const medianWordCount = wordCounts[Math.floor(wordCounts.length / 2)];

  const titles = pages.map((p) => p.title.toLowerCase().trim()).filter(Boolean);
  let identicalTitleRatio = 0;
  if (titles.length > 0) {
    // Find the largest cluster of identical titles, divided by page count.
    const counts = new Map<string, number>();
    for (const t of titles) counts.set(t, (counts.get(t) ?? 0) + 1);
    // Iterative max, not `Math.max(...counts.values())`: a programmatic site can
    // have 100k+ distinct titles, and spreading that many args overflows V8's
    // argument cap ("Maximum call stack size exceeded") during classification.
    let maxClusterSize = 0;
    for (const c of counts.values()) if (c > maxClusterSize) maxClusterSize = c;
    identicalTitleRatio = maxClusterSize / pages.length;
  }

  return { medianWordCount, identicalTitleRatio, pageCount: pages.length };
}
