import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { parseHtmlPage } from "./parser.js";
import { mergeNormalizeUrlOptions, normalizeAuditUrl } from "./url-normalize.js";
import { headingUniquenessRule } from "./rules/content/heading-uniqueness.js";
import { metaUniquenessRule } from "./rules/content/meta-uniqueness.js";
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
  hubPagesMaxSiblings: 50
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

async function loadPagesFromSource(source: string): Promise<LoadedPage[]> {
  const fetchText = async (url: string): Promise<{ text: string; contentType: string }> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`);
    }
    return {
      text: await response.text(),
      contentType: response.headers.get("content-type")?.toLowerCase() ?? ""
    };
  };

  const parseSitemapUrls = (xml: string): string[] => {
    const matches = Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi));
    return matches.map((match) => match[1]).filter(Boolean);
  };

  const looksLikeSitemap = (text: string): boolean => {
    const lowered = text.toLowerCase();
    return lowered.includes("<urlset") || lowered.includes("<sitemapindex");
  };

  const looksLikeHtml = (text: string): boolean => {
    const lowered = text.toLowerCase();
    return lowered.includes("<html") || lowered.includes("<body") || lowered.includes("<!doctype html");
  };

  const isSitemapIndex = (text: string): boolean => {
    return text.toLowerCase().includes("<sitemapindex");
  };

  const loadFromSitemap = async (sitemapUrl: string, visited: Set<string>): Promise<LoadedPage[]> => {
    if (visited.has(sitemapUrl)) {
      return [];
    }
    visited.add(sitemapUrl);

    const { text, contentType } = await fetchText(sitemapUrl);
    const xmlLike = contentType.includes("xml") || looksLikeSitemap(text);
    if (!xmlLike) {
      return [];
    }

    const locs = parseSitemapUrls(text);
    if (isSitemapIndex(text)) {
      const nested = await Promise.all(locs.map((loc) => loadFromSitemap(loc, visited)));
      return nested.flat();
    }

    const pages = await Promise.all(
      locs.map(async (url) => {
        const page = await fetchText(url);
        return { url, html: page.text };
      })
    );
    return pages;
  };

  if (/^https?:\/\//i.test(source)) {
    const { text, contentType } = await fetchText(source);

    const isXml = contentType.includes("xml");
    const isHtml = contentType.includes("html");

    if (isXml || looksLikeSitemap(text)) {
      if (isSitemapIndex(text)) {
        return loadFromSitemap(source, new Set<string>());
      }

      const urls = parseSitemapUrls(text);
      return Promise.all(
        urls.map(async (url) => {
          const page = await fetchText(url);
          return { url, html: page.text };
        })
      );
    }

    if (isHtml || looksLikeHtml(text)) {
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
    hubPagesMaxSiblings: options?.rules?.hubPagesMaxSiblings ?? DEFAULTS.hubPagesMaxSiblings
  };

  const normalizeUrlOptions = mergeNormalizeUrlOptions({
    stripQuery: options?.rules?.stripUrlQuery ?? true,
    stripWwwHost: options?.rules?.stripWwwHost ?? false
  });

  const loadedPages = await loadPagesFromSource(source);
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

  const parsedPages = deduped.map((page) =>
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
  const hreflangConsistency = hreflangConsistencyRule(parsedPages, normalizeUrlOptions);

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
    ...hreflangConsistency
  ];

  const { score, categoryScores } = scoreFromFindings(findings);

  return {
    score,
    categoryScores,
    pageCount: parsedPages.length,
    findings
  };
}
