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
  | "unclear";

export type ClassificationSignal =
  | { kind: "sitemap-url-count"; value: number }
  | {
      kind: "url-pattern-cluster-coverage";
      topTemplate: string;
      pages: number;
      ratio: number;
    }
  | { kind: "framework-detected"; value: "nextjs" | "vite" | "astro" | "unknown" };

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

  // Step 4: synthesize.
  let type: SiteType = "unclear";
  let confidence = 0;

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
