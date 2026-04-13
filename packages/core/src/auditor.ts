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
import { robotsSitemapPresenceRule } from "./rules/tech/robots-sitemap-presence.js";
import { jsonLdValidRule } from "./rules/schema/json-ld-valid.js";
import { requiredFieldsRule } from "./rules/schema/required-fields.js";
import { schemaConsistencyRule } from "./rules/schema/consistency.js";
import { titleOverlapRule } from "./rules/cannibal/title-overlap.js";
import { keywordCollisionRule } from "./rules/cannibal/keyword-collision.js";
import { urlPatternRule } from "./rules/cannibal/url-pattern.js";
import type { AuditOptions, AuditSummary, CategoryScores, EntityMaskPattern, RuleResult, Severity } from "./types.js";

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
  keywordCollisionMinShared: 6
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

interface LoadedPage {
  url: string;
  html: string;
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
  timeoutMs: number
): Promise<{ text: string; contentType: string } | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      return null;
    }
    return {
      text: await response.text(),
      contentType: response.headers.get("content-type")?.toLowerCase() ?? ""
    };
  } catch {
    return null;
  }
}

async function fetchTextStrict(url: string, timeoutMs: number): Promise<{ text: string; contentType: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`);
  }
  return {
    text: await response.text(),
    contentType: response.headers.get("content-type")?.toLowerCase() ?? ""
  };
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
  timeoutMs: number
): Promise<string[]> {
  visited.add(sitemapUrl);
  const locs = parseSitemapUrls(sitemapText);

  if (!isSitemapIndex(sitemapText)) {
    return locs;
  }

  const allUrls: string[] = [];
  for (const childUrl of locs) {
    if (visited.has(childUrl)) continue;
    const child = await fetchWithRetry(childUrl, timeoutMs);
    if (!child) continue;
    const childLike = child.contentType.includes("xml") || looksLikeSitemap(child.text);
    if (!childLike) continue;
    const childUrls = await collectUrlsFromSitemap(child.text, childUrl, visited, timeoutMs);
    allUrls.push(...childUrls);
  }
  return allUrls;
}

async function loadPagesFromSource(source: string, concurrency: number, timeoutMs: number): Promise<LoadedPage[]> {
  if (/^https?:\/\//i.test(source)) {
    const { text, contentType } = await fetchTextStrict(source, timeoutMs);

    const isXml = contentType.includes("xml");

    if (isXml || looksLikeSitemap(text)) {
      const visited = new Set<string>();
      const urls = await collectUrlsFromSitemap(text, source, visited, timeoutMs);

      const pages: LoadedPage[] = [];
      await runWithConcurrency(urls, concurrency, async (url) => {
        const result = await fetchWithRetry(url, timeoutMs);
        if (result) {
          pages.push({ url, html: result.text });
        }
      });
      return pages;
    }

    if (contentType.includes("html") || looksLikeHtml(text)) {
      return [{ url: source, html: text }];
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
    return [{ url: resolved, html: await readFile(resolved, "utf-8") }];
  }

  if (sourceStat.isDirectory()) {
    const htmlFiles = await collectHtmlFiles(resolved);
    return Promise.all(
      htmlFiles.map(async (filePath) => ({
        url: filePath,
        html: await readFile(filePath, "utf-8")
      }))
    );
  }

  return [];
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
    keywordCollisionMinShared: options?.rules?.keywordCollisionMinShared ?? DEFAULTS.keywordCollisionMinShared
  };

  const normalizeUrlOptions = mergeNormalizeUrlOptions({
    stripQuery: options?.rules?.stripUrlQuery ?? true,
    stripWwwHost: options?.rules?.stripWwwHost ?? false
  });

  const loadedPages = await loadPagesFromSource(source, concurrency, timeoutMs);
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
    deduped.push({ url: key, html: page.html });
  }

  const filtered = ignorePatterns.length > 0
    ? deduped.filter((page) => !shouldIgnore(page.url, ignorePatterns))
    : deduped;

  const sampled = sampleSize > 0 && sampleSize < filtered.length
    ? fisherYatesSample(filtered, sampleSize)
    : filtered;

  const parsedPages = sampled.map((page) =>
    parseHtmlPage(page.html, page.url, { normalizeUrl: normalizeUrlOptions })
  );
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

  const nearDuplicate = nearDuplicateRule(parsedPages, resolvedRules.nearDuplicateThreshold);
  const entitySwap = entitySwapRule(
    parsedPages,
    DEFAULT_ENTITY_PATTERNS,
    resolvedRules.entitySwapThreshold
  );
  const thinContent = thinContentRule(parsedPages, resolvedRules.thinContentMinWords);
  const doorwayPattern = doorwayPatternRule(
    nearDuplicate.pairs,
    entitySwap.pairs,
    thinContent.thinContentUrls,
    parsedPages
  );
  const publicationVelocity = publicationVelocityRule(
    parsedPages,
    resolvedRules.publicationVelocityMaxPerDay
  );
  const boilerplateRatio = boilerplateRatioRule(parsedPages, resolvedRules.boilerplateMaxRatio);
  const templateDiversity = templateDiversityRule(
    parsedPages,
    resolvedRules.templateDiversityMinUniqueRatio
  );
  const uniqueValue = uniqueValueRule(parsedPages, resolvedRules.uniqueValueMinWords);
  const headingUniqueness = headingUniquenessRule(parsedPages, DEFAULT_ENTITY_PATTERNS);
  const metaUniqueness = metaUniquenessRule(
    parsedPages,
    DEFAULT_ENTITY_PATTERNS,
    resolvedRules.metaUniquenessMinJaccard
  );
  const orphanPages = orphanPagesRule(parsedPages, inbound, rootUrl);
  const deadEnds = deadEndsRule(parsedPages, knownUrls, rootUrl);
  const linkDepth = rootUrl
    ? linkDepthRule(
        parsedPages,
        adjacency,
        rootUrl,
        resolvedRules.linkDepthMaxClicks,
        inbound
      )
    : [];
  const clusterConnectivity = clusterConnectivityRule(parsedPages, knownUrls);
  const hubPages = hubPagesRule(
    parsedPages,
    knownUrls,
    resolvedRules.hubPagesMinSiblings,
    resolvedRules.hubPagesMaxSiblings
  );
  const canonicalConsistency = canonicalConsistencyRule(
    parsedPages,
    knownUrls,
    normalizeUrlOptions
  );
  const canonicalNoindexConflict = canonicalNoindexConflictRule(parsedPages, normalizeUrlOptions);
  const robotsNoindexConflict = robotsNoindexConflictRule(parsedPages, inbound);
  const robotsSitemapPresence = await robotsSitemapPresenceRule(source);
  const ogCompleteness = ogCompletenessRule(parsedPages);
  const missingAuthor = missingAuthorRule(parsedPages);
  const eeatSignals = eeatSignalsRule(parsedPages);
  const hreflangConsistency = hreflangConsistencyRule(parsedPages, normalizeUrlOptions);
  const jsonLdValid = jsonLdValidRule(parsedPages);
  const requiredFields = requiredFieldsRule(parsedPages);
  const schemaConsistency = schemaConsistencyRule(parsedPages);
  const titleOverlap = titleOverlapRule(
    parsedPages,
    DEFAULT_ENTITY_PATTERNS,
    resolvedRules.titleOverlapThreshold
  );
  const keywordCollision = keywordCollisionRule(
    parsedPages,
    resolvedRules.keywordCollisionMinShared
  );
  const urlPattern = urlPatternRule(parsedPages);

  const findings = [
    ...duplicateUrlFindings,
    ...nearDuplicate.findings,
    ...entitySwap.findings,
    ...thinContent.findings,
    ...doorwayPattern,
    ...publicationVelocity,
    ...boilerplateRatio,
    ...templateDiversity,
    ...uniqueValue,
    ...headingUniqueness,
    ...metaUniqueness,
    ...orphanPages,
    ...deadEnds,
    ...linkDepth,
    ...clusterConnectivity,
    ...hubPages,
    ...canonicalConsistency,
    ...canonicalNoindexConflict,
    ...robotsNoindexConflict,
    ...robotsSitemapPresence,
    ...ogCompleteness,
    ...missingAuthor,
    ...eeatSignals,
    ...hreflangConsistency,
    ...jsonLdValid,
    ...requiredFields,
    ...schemaConsistency,
    ...titleOverlap,
    ...keywordCollision,
    ...urlPattern
  ];

  const { score, categoryScores } = scoreFromFindings(findings);

  return {
    score,
    categoryScores,
    pageCount: parsedPages.length,
    findings
  };
}
