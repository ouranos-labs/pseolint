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
import { robotsComplianceRule, parseDisallowPatterns, isBlockedByPattern, parseCrawlDelaySeconds } from "./rules/tech/robots-sitemap-presence.js";
import { llmsTxtRule } from "./rules/aeo/llms-txt.js";
import { crawlerAccessRule } from "./rules/aeo/crawler-access.js";
import { freshnessSignalsRule } from "./rules/aeo/freshness-signals.js";
import { faqCoverageRule } from "./rules/aeo/faq-coverage.js";
import { answerFirstRule } from "./rules/aeo/answer-first.js";
import { citableFactsRule } from "./rules/aeo/citable-facts.js";
import { nonReplicableValueRule } from "./rules/aeo/non-replicable-value.js";
import { contentModularityRule } from "./rules/aeo/content-modularity.js";
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
import type { AuditOptions, AuditSummary, CacheStats, CategoryScores, EntityMaskPattern, NormalizeUrlOptions, ParsedPage, RuleResult, Severity } from "./types.js";
import { cachedFetch, type CacheConfig } from "./cache.js";
import { stratifiedSample } from "./stratified-sample.js";
import {
  readState, writeState, computeContentHash, STATE_SCHEMA_VERSION,
  type RunState, type RenderMode, type UrlStateEntry,
} from "./state.js";

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
  templateCoverageMinPages: 5,
  answerFirstMaxWords: 100,
  citableFactsMin: 3,
  citableFactsTarget: 8,
  freshnessMaxStaleDays: 180,
  modularityMaxParagraphWords: 200,
  modularityMinSelfContainedRatio: 0.7,
  faqMinQuestionHeadings: 2
} as const;

const CATEGORY_WEIGHTS = {
  spam: 0.35,
  content: 0.2,
  aeo: 0.15,
  links: 0.12,
  tech: 0.08,
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

  // AEO rules
  if (isEnabled("aeo/freshness-signals")) {
    findings.push(...tag(freshnessSignalsRule(pages, {
      maxStaleDays: resolvedRules.freshnessMaxStaleDays,
    })));
  }

  if (isEnabled("aeo/faq-coverage")) {
    findings.push(...tag(faqCoverageRule(pages, {
      minQuestionHeadings: resolvedRules.faqMinQuestionHeadings,
    })));
  }

  if (isEnabled("aeo/answer-first")) {
    findings.push(...tag(answerFirstRule(pages, entityPatterns, {
      maxFirstParagraphWords: resolvedRules.answerFirstMaxWords,
    })));
  }

  if (isEnabled("aeo/citable-facts")) {
    findings.push(...tag(citableFactsRule(pages, entityPatterns, {
      minFactsPerPage: resolvedRules.citableFactsMin,
      targetFactsPerPage: resolvedRules.citableFactsTarget,
    })));
  }

  if (isEnabled("aeo/non-replicable-value")) {
    findings.push(...tag(nonReplicableValueRule(pages)));
  }

  if (isEnabled("aeo/content-modularity")) {
    findings.push(...tag(contentModularityRule(pages, {
      maxParagraphWords: resolvedRules.modularityMaxParagraphWords,
      minSelfContainedRatio: resolvedRules.modularityMinSelfContainedRatio,
    })));
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
    aeo: 0,
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
    raw.aeo * CATEGORY_WEIGHTS.aeo +
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
      aeo: raw.aeo,
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

async function fetchRobotsMeta(
  origin: string,
  timeoutMs: number,
  cache: CacheConfig | null,
  stats: CacheStats,
): Promise<{ disallow: string[]; crawlDelaySec: number }> {
  if (!origin) return { disallow: [], crawlDelaySec: 0 };
  try {
    const robotsUrl = `${origin}/robots.txt`;
    const fetched = await fetchTextStrict(robotsUrl, timeoutMs, cache, stats);
    return {
      disallow: parseDisallowPatterns(fetched.text),
      crawlDelaySec: parseCrawlDelaySeconds(fetched.text),
    };
  } catch {
    return { disallow: [], crawlDelaySec: 0 };
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

async function loadPagesFromSource(
  source: string,
  concurrency: number,
  timeoutMs: number,
  crawlDiscovery: boolean,
  discoveryBudget: number,
  cache: CacheConfig | null,
  stats: CacheStats,
  fillBudgetViaLinkDiscovery: boolean = false,
  byteBudget: ByteBudget = { used: 0, cap: 0 }
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

      // Fetch robots.txt once for the origin — reused for Crawl-Delay pacing and Disallow checks.
      const sourceOrigin = (() => { try { return new URL(source).origin; } catch { return ""; } })();
      const robots = await fetchRobotsMeta(sourceOrigin, timeoutMs, cache, stats);
      const effectiveConcurrency = robots.crawlDelaySec > 0 ? 1 : concurrency;
      const delayMs = robots.crawlDelaySec * 1000;

      await runWithConcurrency(urlsToFetch, effectiveConcurrency, async (url) => {
        if (budgetExceeded(byteBudget)) return;
        const result = await fetchPageWithMeta(url, timeoutMs, cache, stats);
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
              if (sitemapUrlSet.has(normalized) || discoveredUrls.has(normalized)) continue;
              if (isDisallowedByRobots(resolvedUrl.pathname, disallowPatterns)) continue;
              discoveredUrls.add(normalized);
            } catch {
              continue;
            }
          }
        }

        if (discoveredUrls.size > 0) {
          const candidates = Array.from(discoveredUrls);
          // Fisher-Yates shuffle so we don't bias toward the first-discovered links (nav/footer).
          const shuffled = fisherYatesSample(candidates, candidates.length);
          const remaining = discoveryBudget === 0 ? Infinity : discoveryBudget - pages.length;
          const toFetch = remaining === Infinity ? shuffled : shuffled.slice(0, remaining);
          await runWithConcurrency(toFetch, effectiveConcurrency, async (url) => {
            if (budgetExceeded(byteBudget)) return;
            const result = await fetchPageWithMeta(url, timeoutMs, cache, stats);
            if (result && result.httpMeta && result.httpMeta.statusCode >= 200 && result.httpMeta.statusCode < 300) {
              byteBudget.used += result.html.length;
              pages.push(result);
            }
            if (delayMs > 0) await sleep(delayMs);
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
  const runId = generateRunId();
  const runStartedAt = Date.now();
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

  const cacheStats = { hits: 0, total: 0, bytesSavedEstimate: 0 };
  const cacheConfig: CacheConfig | null = options?.cache
    ? {
        dir: options.cache.dir ?? ".pseolint/cache",
        ttlMs: options.cache.ttlMs ?? 7 * 24 * 60 * 60 * 1000,
      }
    : null;

  const fillBudgetViaLinkDiscovery = options?.fillBudgetViaLinkDiscovery ?? false;
  const maxFetchBytes = options?.maxFetchBytes ?? 52_428_800;
  const fetchByteBudget: ByteBudget = { used: 0, cap: maxFetchBytes };
  const { pages: loadedPagesRaw, sitemapUrls: sitemapUrlSet, discoveredUrlCount } = await loadPagesFromSource(source, concurrency, timeoutMs, crawlDiscovery, discoveryBudget, cacheConfig, cacheStats, fillBudgetViaLinkDiscovery, fetchByteBudget);
  const loadedPages = [...loadedPagesRaw];

  if (discoveredUrlCount && discoveredUrlCount > loadedPages.length) {
    console.error(`Discovered ${discoveredUrlCount} pages, fetched ${loadedPages.length} for audit. Use --sample-size 0 for full crawl.`);
  }

  // State read + delta filtering
  let priorState: RunState | null = null;
  const skippedUrls: string[] = [];
  if (options?.state?.since || options?.state?.exitOnRegression) {
    const statePath = options.state.path ?? ".pseolint/state.json";
    priorState = await readState(statePath);
    const currentRenderMode: RenderMode = options.render ? "rendered" : "static";
    if (priorState && priorState.renderMode !== currentRenderMode) {
      console.error(
        `warning: prior state renderMode=${priorState.renderMode} differs from current ${currentRenderMode}. Performing full re-audit.`
      );
      priorState = null;
    }
    if (priorState && options.state.since) {
      const kept: LoadedPage[] = [];
      for (const p of loadedPages) {
        const prior = priorState.urls[p.url];
        if (prior && prior.contentHash === computeContentHash(p.html)) {
          skippedUrls.push(p.url);
        } else {
          kept.push(p);
        }
      }
      loadedPages.splice(0, loadedPages.length, ...kept);
    } else if (!priorState && options.state.since) {
      console.error("no prior state found — performing full baseline audit");
    }
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

  // AEO site-wide rules. These run unconditionally (consistent with sitemap-completeness
  // and robots-compliance); page-group rule lists govern per-page AEO rules only.
  const llmsFindings = await llmsTxtRule(source, { timeoutMs });
  allFindings.push(...llmsFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));

  if (robotsTxtContent) {
    const crawlerFindings = crawlerAccessRule(robotsTxtContent);
    allFindings.push(...crawlerFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
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

  if (skippedUrls.length > 0) {
    summary.skippedUrls = skippedUrls;
  }

  if (priorState && options?.state?.exitOnRegression) {
    let hasRegression = false;
    const currentFindings = new Map<string, Set<string>>();
    for (const f of summary.findings) {
      if (!f.pageUrl) continue;
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
    for (const f of summary.findings) {
      if (!f.pageUrl) continue;
      const list = findingsByUrl.get(f.pageUrl) ?? [];
      if (!list.includes(f.ruleId)) list.push(f.ruleId);
      findingsByUrl.set(f.pageUrl, list);
    }
    // Preserve prior entries for URLs skipped by --since (they didn't change).
    // Without this, delta runs would lose state for unchanged URLs.
    if (priorState && skippedUrls.length > 0) {
      for (const url of skippedUrls) {
        const prior = priorState.urls[url];
        if (prior) urls[url] = prior;
      }
    }
    for (const p of loadedPages) {
      urls[p.url] = {
        contentHash: computeContentHash(p.html),
        fetchedAt: new Date().toISOString(),
        status: p.httpMeta?.statusCode ?? 200,
        findingIds: findingsByUrl.get(p.url) ?? [],
      };
    }
    const newState: RunState = {
      version: STATE_SCHEMA_VERSION,
      lastRun: new Date().toISOString(),
      source,
      renderMode,
      urls,
      summary: {
        score: summary.score,
        totalFindings: summary.findings.length,
        byCategory: Object.fromEntries(
          Object.entries(summary.categoryScores).map(([k, v]) => [k, v])
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

      const outcome = await triageFindings(summary.findings, summary.pageCount, {
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
      score: summary.score,
      pageCount: summary.pageCount,
      findingCount: summary.findings.length,
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
      `💡 AI triage available — re-run with --ai to prioritize ${summary.findings.length} findings into a fix list.`,
    );
  }

  return summary;
}
