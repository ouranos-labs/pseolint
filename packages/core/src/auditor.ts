import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { parseHtmlPage } from "./parser.js";
import { mergeNormalizeUrlOptions, normalizeAuditUrl } from "./url-normalize.js";
import { eeatSignalsRule } from "./rules/content/eeat-signals.js";
import { headingUniquenessRule } from "./rules/content/heading-uniqueness.js";
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
import { hubPagesRule } from "./rules/links/hub-pages.js";
import { orphanPagesRule } from "./rules/links/orphan-pages.js";
import { canonicalConsistencyRule } from "./rules/tech/canonical-consistency.js";
import { canonicalNoindexConflictRule } from "./rules/tech/canonical-noindex-conflict.js";
import { hreflangConsistencyRule } from "./rules/tech/hreflang-consistency.js";
import { ogCompletenessRule } from "./rules/tech/og-completeness.js";
import { robotsNoindexConflictRule } from "./rules/tech/robots-noindex-conflict.js";
import { sitemapCompletenessRule } from "./rules/tech/sitemap-completeness.js";
import { robotsComplianceRule } from "./rules/tech/robots-sitemap-presence.js";
import { redirectChainRule } from "./rules/tech/redirect-chain.js";
import { soft404Rule } from "./rules/tech/soft-404.js";
import { jsonLdValidRule } from "./rules/schema/json-ld-valid.js";
import { requiredFieldsRule } from "./rules/schema/required-fields.js";
import { schemaConsistencyRule } from "./rules/schema/consistency.js";
import { titleOverlapRule } from "./rules/cannibal/title-overlap.js";
import { keywordCollisionRule } from "./rules/cannibal/keyword-collision.js";
import { urlPatternRule } from "./rules/cannibal/url-pattern.js";
import { templateCoverageRule } from "./rules/spam/template-coverage.js";
import { dataBindingRule, dataIdenticalRule } from "./rules/data/data-binding.js";
import { classifyPages, isRuleEnabled } from "./page-classifier.js";
import { RULE_REFERENCES } from "./rule-references.js";
import { enrichFindings } from "./enrich-findings.js";
import type { AuditOptions, AuditSummary, CacheStats, CategoryScores, EntityMaskPattern, NormalizeUrlOptions, ParsedPage, RuleResult, Severity } from "./types.js";
import { cachedFetch, type CacheConfig } from "./cache.js";
import { stratifiedSample } from "./stratified-sample.js";

const DEFAULTS = {
  nearDuplicateThreshold: 0.85,
  entitySwapThreshold: 0.95,
  thinContentMinWords: 300,
  publicationVelocityMaxPerDay: 100,
  boilerplateMaxRatio: 0.7,
  templateDiversityMinUniqueRatio: 0.35,
  uniqueValueMinWords: 100,
  metaUniquenessMinJaccard: 0.9,
  linkDepthMaxClicks: 3,
  hubPagesMinSiblings: 4,
  hubPagesMaxSiblings: 50,
  titleOverlapThreshold: 0.8,
  keywordCollisionMinShared: 6,
  templateCoverageMinPages: 5
} as const;

const CATEGORY_WEIGHTS = {
  spam: 0.4,
  content: 0.25,
  links: 0.15,
  tech: 0.1,
  schema: 0.05,
  cannibal: 0.05,
  /** Dedup / crawl hygiene; does not affect composite score. */
  audit: 0
} as const;

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
  resolvedRules: {
    nearDuplicateThreshold: number;
    entitySwapThreshold: number;
    thinContentMinWords: number;
    publicationVelocityMaxPerDay: number;
    boilerplateMaxRatio: number;
    templateDiversityMinUniqueRatio: number;
    uniqueValueMinWords: number;
    metaUniquenessMinJaccard: number;
    linkDepthMaxClicks: number;
    hubPagesMinSiblings: number;
    hubPagesMaxSiblings: number;
    titleOverlapThreshold: number;
    keywordCollisionMinShared: number;
    templateCoverageMinPages: number;
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
  overrides?: Record<string, Record<string, unknown>>
): RuleResult[] {
  const findings: RuleResult[] = [];

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
  if (isEnabled("spam/near-duplicate")) {
    findings.push(...tag(nearDuplicate.findings));
  }

  const entitySwap = entitySwapRule(pages, entityPatterns, resolvedRules.entitySwapThreshold);
  if (isEnabled("spam/entity-swap")) {
    findings.push(...tag(entitySwap.findings));
  }

  const thinContent = thinContentRule(pages, resolvedRules.thinContentMinWords);
  if (isEnabled("spam/thin-content")) {
    findings.push(...tag(thinContent.findings));
  }

  if (isEnabled("spam/doorway-pattern")) {
    findings.push(...tag(doorwayPatternRule(nearDuplicate.pairs, entitySwap.pairs, thinContent.thinContentUrls, pages)));
  }

  if (isEnabled("spam/publication-velocity")) {
    findings.push(...tag(publicationVelocityRule(pages, resolvedRules.publicationVelocityMaxPerDay)));
  }

  if (isEnabled("spam/boilerplate-ratio")) {
    findings.push(...tag(boilerplateRatioRule(pages, resolvedRules.boilerplateMaxRatio)));
  }

  if (isEnabled("spam/template-diversity")) {
    findings.push(...tag(templateDiversityRule(pages, resolvedRules.templateDiversityMinUniqueRatio)));
  }

  if (isEnabled("spam/template-coverage")) {
    findings.push(...tag(templateCoverageRule(pages, entityPatterns, resolvedRules.templateCoverageMinPages)));
  }

  // Content rules
  if (isEnabled("content/unique-value")) {
    findings.push(...tag(uniqueValueRule(pages, resolvedRules.uniqueValueMinWords)));
  }

  if (isEnabled("content/heading-uniqueness")) {
    findings.push(...tag(headingUniquenessRule(pages, entityPatterns)));
  }

  if (isEnabled("content/meta-uniqueness")) {
    findings.push(...tag(metaUniquenessRule(pages, entityPatterns, resolvedRules.metaUniquenessMinJaccard)));
  }

  if (isEnabled("content/missing-author")) {
    findings.push(...tag(missingAuthorRule(pages)));
  }

  if (isEnabled("content/eeat-signals")) {
    findings.push(...tag(eeatSignalsRule(pages)));
  }

  // Link rules — use the global link graph
  if (isEnabled("links/orphan-pages")) {
    findings.push(...tag(orphanPagesRule(pages, inbound, rootUrl)));
  }

  if (isEnabled("links/dead-ends")) {
    findings.push(...tag(deadEndsRule(pages, knownUrls, rootUrl)));
  }

  if (isEnabled("links/link-depth")) {
    if (rootUrl) {
      findings.push(...tag(linkDepthRule(pages, adjacency, rootUrl, resolvedRules.linkDepthMaxClicks, inbound)));
    }
  }

  if (isEnabled("links/cluster-connectivity")) {
    findings.push(...tag(clusterConnectivityRule(pages, knownUrls)));
  }

  if (isEnabled("links/hub-pages")) {
    findings.push(...tag(hubPagesRule(pages, knownUrls, resolvedRules.hubPagesMinSiblings, resolvedRules.hubPagesMaxSiblings)));
  }

  // Tech rules
  if (isEnabled("tech/canonical-consistency")) {
    findings.push(...tag(canonicalConsistencyRule(pages, knownUrls, normalizeUrlOptions)));
  }

  if (isEnabled("tech/canonical-noindex-conflict")) {
    findings.push(...tag(canonicalNoindexConflictRule(pages, normalizeUrlOptions)));
  }

  if (isEnabled("tech/robots-noindex-conflict")) {
    findings.push(...tag(robotsNoindexConflictRule(pages, inbound)));
  }

  if (isEnabled("tech/redirect-chain")) {
    findings.push(...tag(redirectChainRule(pages)));
  }

  if (isEnabled("tech/soft-404")) {
    findings.push(...tag(soft404Rule(pages)));
  }

  if (isEnabled("tech/og-completeness")) {
    findings.push(...tag(ogCompletenessRule(pages)));
  }

  if (isEnabled("tech/hreflang-consistency")) {
    findings.push(...tag(hreflangConsistencyRule(pages, normalizeUrlOptions)));
  }

  // Schema rules
  if (isEnabled("schema/json-ld-valid")) {
    findings.push(...tag(jsonLdValidRule(pages)));
  }

  if (isEnabled("schema/required-fields")) {
    findings.push(...tag(requiredFieldsRule(pages)));
  }

  if (isEnabled("schema/consistency")) {
    findings.push(...tag(schemaConsistencyRule(pages)));
  }

  // Cannibal rules
  if (isEnabled("cannibal/title-overlap")) {
    findings.push(...tag(titleOverlapRule(pages, entityPatterns, resolvedRules.titleOverlapThreshold)));
  }

  if (isEnabled("cannibal/keyword-collision")) {
    findings.push(...tag(keywordCollisionRule(pages, resolvedRules.keywordCollisionMinShared)));
  }

  if (isEnabled("cannibal/url-pattern")) {
    findings.push(...tag(urlPatternRule(pages)));
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

function scoreFromFindings(findings: RuleResult[]): { score: number; categoryScores: CategoryScores } {
  const severityWeights: Record<Severity, number> = {
    critical: 40,
    error: 25,
    warning: 12,
    info: 5
  };

  const raw: Record<keyof typeof CATEGORY_WEIGHTS, number> = {
    spam: 0,
    content: 0,
    links: 0,
    tech: 0,
    schema: 0,
    cannibal: 0,
    audit: 0
  };

  for (const finding of findings) {
    const category = finding.ruleId.split("/")[0] as keyof typeof CATEGORY_WEIGHTS;
    if (!(category in raw)) {
      continue;
    }
    raw[category] = Math.min(100, raw[category] + severityWeights[finding.severity]);
  }

  const weighted =
    raw.spam * CATEGORY_WEIGHTS.spam +
    raw.content * CATEGORY_WEIGHTS.content +
    raw.links * CATEGORY_WEIGHTS.links +
    raw.tech * CATEGORY_WEIGHTS.tech +
    raw.schema * CATEGORY_WEIGHTS.schema +
    raw.cannibal * CATEGORY_WEIGHTS.cannibal +
    raw.audit * CATEGORY_WEIGHTS.audit;

  return {
    score: Math.round(Math.min(100, weighted)),
    categoryScores: {
      spam: raw.spam,
      content: raw.content,
      links: raw.links,
      tech: raw.tech,
      schema: raw.schema,
      cannibal: raw.cannibal
    }
  };
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

async function fetchWithRetry(
  url: string,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats
): Promise<{ text: string; contentType: string } | null> {
  try {
    stats.total += 1;
    const r = await cachedFetch(url, { timeoutMs, cache });
    if (r.fromCache) {
      stats.hits += 1;
      stats.bytesSavedEstimate += r.body.length;
    }
    if (r.status < 200 || r.status >= 300) return null;
    return { text: r.body, contentType: (r.headers["content-type"] ?? "").toLowerCase() };
  } catch {
    return null;
  }
}

async function fetchPageWithMeta(
  url: string,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats
): Promise<LoadedPage | null> {
  try {
    stats.total += 1;
    const r = await cachedFetch(url, { timeoutMs, cache });
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
  } catch {
    return null;
  }
}

async function fetchTextStrict(
  url: string,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats
): Promise<{ text: string; contentType: string }> {
  stats.total += 1;
  const r = await cachedFetch(url, { timeoutMs, cache });
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
  for (const pattern of patterns) {
    if (matchGlob(pattern, url)) return true;
  }
  return false;
}

function fisherYatesSample<T>(items: T[], n: number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0 && arr.length - i <= n; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(arr.length - n);
}

async function collectUrlsFromSitemap(
  sitemapText: string,
  sitemapUrl: string,
  visited: Set<string>,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats
): Promise<string[]> {
  visited.add(sitemapUrl);
  const locs = parseSitemapUrls(sitemapText);

  if (!isSitemapIndex(sitemapText)) {
    return locs;
  }

  const allUrls: string[] = [];
  for (const childUrl of locs) {
    if (visited.has(childUrl)) continue;
    const child = await fetchWithRetry(childUrl, timeoutMs, cache, stats);
    if (!child) continue;
    const childLike = child.contentType.includes("xml") || looksLikeSitemap(child.text);
    if (!childLike) continue;
    const childUrls = await collectUrlsFromSitemap(child.text, childUrl, visited, timeoutMs, cache, stats);
    allUrls.push(...childUrls);
  }
  return allUrls;
}

async function loadPagesFromSource(
  source: string,
  concurrency: number,
  timeoutMs: number,
  crawlDiscovery: boolean,
  discoveryBudget: number,
  cache: CacheConfig | null,
  stats: CacheStats
): Promise<{ pages: LoadedPage[]; sitemapUrls?: Set<string>; discoveredUrlCount?: number }> {
  if (/^https?:\/\//i.test(source)) {
    let text: string;
    let contentType: string;
    let sourceStatus = 200;
    try {
      const fetched = await fetchTextStrict(source, timeoutMs, cache, stats);
      text = fetched.text;
      contentType = fetched.contentType;
    } catch {
      // Sitemap URL returned non-200 — fallback to crawl from origin homepage
      if (source.includes("sitemap")) {
        try {
          const origin = new URL(source).origin;
          const fallback = await fetchTextStrict(origin, timeoutMs, cache, stats);
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
      const allSitemapUrls = await collectUrlsFromSitemap(text, source, visited, timeoutMs, cache, stats);

      // If we have a budget, sample from sitemap URLs before fetching
      const urlsToFetch = discoveryBudget > 0 && allSitemapUrls.length > discoveryBudget
        ? fisherYatesSample(allSitemapUrls, discoveryBudget)
        : allSitemapUrls;

      const pages: LoadedPage[] = [];
      await runWithConcurrency(urlsToFetch, concurrency, async (url) => {
        const result = await fetchPageWithMeta(url, timeoutMs, cache, stats);
        if (result) {
          pages.push(result);
        }
      });

      // Skip additional crawl discovery when budget is active — sitemap is authoritative
      if (crawlDiscovery && discoveryBudget === 0) {
        const sitemapUrlSet = new Set(allSitemapUrls);
        const discoveredUrls = new Set<string>();
        let sourceOrigin: string;
        try {
          sourceOrigin = new URL(source).origin;
        } catch {
          sourceOrigin = "";
        }

        for (const page of pages) {
          const linkMatches = Array.from(page.html.matchAll(/href=["']([^"']+)["']/gi));
          for (const match of linkMatches) {
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
              if (!sitemapUrlSet.has(normalized) && !discoveredUrls.has(normalized)) {
                discoveredUrls.add(normalized);
              }
            } catch {
              continue;
            }
          }
        }

        if (discoveredUrls.size > 0) {
          await runWithConcurrency(Array.from(discoveredUrls), concurrency, async (url) => {
            const result = await fetchPageWithMeta(url, timeoutMs, cache, stats);
            if (result && result.httpMeta && result.httpMeta.statusCode >= 200 && result.httpMeta.statusCode < 300) {
              pages.push(result);
            }
          });
        }
      }

      return { pages, sitemapUrls: new Set(allSitemapUrls), discoveredUrlCount: allSitemapUrls.length };
    }

    if (contentType.includes("html") || looksLikeHtml(text)) {
      const initialPage: LoadedPage = { url: source, html: text };
      const pages: LoadedPage[] = [initialPage];

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
            const result = await fetchPageWithMeta(url, timeoutMs, cache, stats);
            if (result && result.httpMeta && result.httpMeta.statusCode >= 200 && result.httpMeta.statusCode < 300) {
              newPages.push(result);
              knownCrawled.add(url);
              knownCrawled.add("__depth_" + (depth + 1) + "_" + url);
            } else {
              knownCrawled.add(url);
            }
          });

          pages.push(...newPages);
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
  const concurrency = options?.concurrency ?? 5;
  const timeoutMs = options?.timeout ?? 30000;
  const ignorePatterns = options?.ignore ?? [];
  const sampleSize = options?.sampleSize ?? 0;

  const resolvedRules = {
    nearDuplicateThreshold:
      options?.rules?.nearDuplicateThreshold ?? DEFAULTS.nearDuplicateThreshold,
    entitySwapThreshold: options?.rules?.entitySwapThreshold ?? DEFAULTS.entitySwapThreshold,
    thinContentMinWords: options?.rules?.thinContentMinWords ?? DEFAULTS.thinContentMinWords,
    publicationVelocityMaxPerDay:
      options?.rules?.publicationVelocityMaxPerDay ?? DEFAULTS.publicationVelocityMaxPerDay,
    boilerplateMaxRatio: options?.rules?.boilerplateMaxRatio ?? DEFAULTS.boilerplateMaxRatio,
    templateDiversityMinUniqueRatio:
      options?.rules?.templateDiversityMinUniqueRatio ?? DEFAULTS.templateDiversityMinUniqueRatio,
    uniqueValueMinWords: options?.rules?.uniqueValueMinWords ?? DEFAULTS.uniqueValueMinWords,
    metaUniquenessMinJaccard:
      options?.rules?.metaUniquenessMinJaccard ?? DEFAULTS.metaUniquenessMinJaccard,
    linkDepthMaxClicks: options?.rules?.linkDepthMaxClicks ?? DEFAULTS.linkDepthMaxClicks,
    hubPagesMinSiblings: options?.rules?.hubPagesMinSiblings ?? DEFAULTS.hubPagesMinSiblings,
    hubPagesMaxSiblings: options?.rules?.hubPagesMaxSiblings ?? DEFAULTS.hubPagesMaxSiblings,
    titleOverlapThreshold: options?.rules?.titleOverlapThreshold ?? DEFAULTS.titleOverlapThreshold,
    keywordCollisionMinShared: options?.rules?.keywordCollisionMinShared ?? DEFAULTS.keywordCollisionMinShared,
    templateCoverageMinPages: options?.rules?.templateCoverageMinPages ?? DEFAULTS.templateCoverageMinPages
  };

  const normalizeUrlOptions = mergeNormalizeUrlOptions({
    stripQuery: options?.rules?.stripUrlQuery ?? true,
    stripWwwHost: options?.rules?.stripWwwHost ?? false
  });

  const crawlDiscovery = /^https?:\/\//i.test(source) && (options?.crawlDiscovery ?? true);

  const isRemote = /^https?:\/\//i.test(source);
  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(source);

  let discoveryBudget = 0; // 0 = unlimited
  if (isRemote && !isLocalhost && options?.sampleSize === undefined) {
    // User didn't set sample size — apply adaptive budget for remote
    discoveryBudget = 200;
  } else if (isRemote && !isLocalhost && (options?.sampleSize ?? 0) > 0) {
    // User set a specific sample size — budget is 2x that, min 50
    discoveryBudget = Math.max(50, (options?.sampleSize ?? 0) * 2);
  }
  // sampleSize explicitly 0 or localhost/file → unlimited

  const cacheStats = { hits: 0, total: 0, bytesSavedEstimate: 0 };
  const cacheConfig: CacheConfig | null = options?.cache
    ? {
        dir: options.cache.dir ?? ".pseolint/cache",
        ttlMs: options.cache.ttlMs ?? 7 * 24 * 60 * 60 * 1000,
      }
    : null;

  const { pages: loadedPages, sitemapUrls: sitemapUrlSet, discoveredUrlCount } = await loadPagesFromSource(source, concurrency, timeoutMs, crawlDiscovery, discoveryBudget, cacheConfig, cacheStats);

  if (discoveredUrlCount && discoveredUrlCount > loadedPages.length) {
    console.error(`Discovered ${discoveredUrlCount} pages, fetched ${loadedPages.length} for audit. Use --sample-size 0 for full crawl.`);
  }

  let robotsTxtContent = "";
  if (/^https?:\/\//i.test(source)) {
    try {
      const origin = new URL(source).origin;
      const result = await fetchWithRetry(`${origin}/robots.txt`, timeoutMs, cacheConfig, cacheStats);
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
  const sampled = sampleSize > 0 && sampleSize < filtered.length
    ? (strategy === "stratified"
        ? (() => {
            const urlsMap = new Map(filtered.map(p => [p.url, p]));
            const sampledUrls = stratifiedSample(filtered.map(p => p.url), sampleSize);
            return sampledUrls.map(u => urlsMap.get(u)!);
          })()
        : fisherYatesSample(filtered, sampleSize))
    : filtered;

  const parsedPages = sampled.map((page) => {
    const parsed = parseHtmlPage(page.html, page.url, { normalizeUrl: normalizeUrlOptions });
    if (page.httpMeta) {
      (parsed as unknown as Record<string, unknown>).httpMeta = page.httpMeta;
    }
    return parsed;
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
          try {
            // Flags validated against SAFE_FLAGS_RE above; pattern is from trusted local config, not HTTP input.
            return { placeholder: p.placeholder, pattern: new RegExp(p.pattern, rawFlags) }; // nosemgrep
          } catch (err) {
            throw new Error(
              `Invalid regex pattern for placeholder "${p.placeholder}": ${(err as Error).message}`
            );
          }
        }),
      ]
    : DEFAULT_ENTITY_PATTERNS;

  // Classify pages into groups and run only enabled rules per group
  const classified = classifyPages(parsedPages, options?.pageGroups);
  const allFindings: RuleResult[] = [...duplicateUrlFindings];
  const groupScores: Record<string, number> = {};
  const groupPageCounts: Record<string, number> = {};

  // Site-wide rules (run once, outside group loop)
  if (sitemapUrlSet && sitemapUrlSet.size > 0) {
    const sitemapFindings = sitemapCompletenessRule(parsedPages, sitemapUrlSet);
    allFindings.push(...sitemapFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));

    if (robotsTxtContent) {
      const robotsFindings = robotsComplianceRule(parsedPages, sitemapUrlSet, robotsTxtContent);
      allFindings.push(...robotsFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
    }
  }

  // Data source comparison rules
  if (options?.dataSource?.records && options.dataSource.records.length > 0) {
    const dataFindings = [
      ...dataBindingRule(parsedPages, options.dataSource.records),
      ...dataIdenticalRule(parsedPages, options.dataSource.records),
    ];
    allFindings.push(...dataFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
  }

  for (const [groupName, groupPages] of classified) {
    if (groupPages.length === 0) continue;

    const groupConfig = groupName === "__default" ? undefined : options?.pageGroups?.[groupName];
    if (groupConfig?.rules !== undefined && groupConfig.rules.length === 0) continue;

    const groupRules = resolveGroupRules(
      resolvedRules as unknown as Record<string, unknown>,
      groupConfig?.overrides
    ) as typeof resolvedRules;
    const enabledCheck = (ruleId: string) => isRuleEnabled(ruleId, groupConfig?.rules);

    const findings = runRulesOnPages(
      groupPages, groupRules, enabledCheck, groupName,
      knownUrls, adjacency, inbound, rootUrl,
      normalizeUrlOptions, source, DEFAULT_ENTITY_PATTERNS,
      groupConfig?.overrides
    );

    allFindings.push(...findings);
    groupPageCounts[groupName] = groupPages.length;
    const { score } = scoreFromFindings(findings);
    groupScores[groupName] = score;
  }

  // Enrich findings: cluster pairwise, detect templates, assign effort
  const enriched = enrichFindings(allFindings, parsedPages, {
    templateGenerated: options?.templateGenerated,
  });

  const { score, categoryScores } = scoreFromFindings(enriched.findings);
  const auditedPageCount = Object.values(groupPageCounts).reduce((a, b) => a + b, 0);

  const summary: AuditSummary = {
    score,
    categoryScores,
    groupScores: options?.pageGroups ? groupScores : undefined,
    groupPageCounts: options?.pageGroups ? groupPageCounts : undefined,
    pageCount: auditedPageCount || parsedPages.length,
    findings: enriched.findings,
    templateDetected: enriched.templateDetected,
    rawFindingCount: enriched.rawFindingCount,
  };

  if (cacheConfig) {
    summary.cacheStats = cacheStats;
  }

  return summary;
}
