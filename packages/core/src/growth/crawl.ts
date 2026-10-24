import { safeFetch, type Fetcher } from "../cache.js";
import { parseHtmlPage } from "../parser.js";
import { parseSitemapUrlsWithLastmod } from "../auditor.js";
import { normalizeAuditUrl } from "../url-normalize.js";
import { simHashFromText } from "../algorithms/simhash.js";
import { mulberry32 } from "../stratified-sample.js";

/** Protocol- and www-agnostic identity, so GSC URLs, sitemap URLs and hrefs join. */
export function urlKey(u: string): string {
  return normalizeAuditUrl(u, { stripWwwHost: true }).replace(/^https?:\/\//i, "");
}

export interface GrowthPage {
  url: string;
  key: string;
  status: number;
  /** False when noindex, canonicalised elsewhere, or non-200: Google is told not to show it. */
  indexable: boolean;
  blockReason?: "noindex" | "canonical-elsewhere" | "http-error";
  title: string;
  h1: string;
  wordCount: number;
  h2Count: number;
  jsonLdCount: number;
  /** Unique internal link targets (keys). */
  outlinks: string[];
  simhash: bigint;
}

export interface CrawlOptions {
  fetcher?: Fetcher;
  timeoutMs?: number;
  concurrency?: number;
  /** Max pages fetched. Over the cap we take a template-stratified uniform sample. */
  maxPages?: number;
  seed?: number;
  onProgress?: (done: number, total: number) => void;
}

async function getText(url: string, opts: CrawlOptions): Promise<{ status: number; body: string; url: string } | null> {
  try {
    const r = await safeFetch(url, { timeoutMs: opts.timeoutMs ?? 20000, fetcher: opts.fetcher });
    return { status: r.status, body: r.body, url: r.url };
  } catch {
    return null;
  }
}

/** Walks robots.txt `Sitemap:` directives (or /sitemap.xml) through sitemap indexes. */
export async function collectSitemapUrls(origin: string, opts: CrawlOptions = {}): Promise<Array<{ url: string; lastmod?: string }>> {
  const robots = await getText(`${origin}/robots.txt`, opts);
  const declared = robots?.status === 200 ? [...robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]) : [];
  const queue = declared.length > 0 ? declared : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  const seen = new Set<string>();
  const out = new Map<string, { url: string; lastmod?: string }>();
  // ponytail: breadth walk with a hard cap of 200 sitemap files; no .gz support.
  while (queue.length > 0 && seen.size < 200) {
    const sm = queue.shift()!;
    if (seen.has(sm)) continue;
    seen.add(sm);
    const r = await getText(sm, opts);
    if (!r || r.status !== 200) continue;
    const entries = parseSitemapUrlsWithLastmod(r.body);
    if (/<sitemapindex/i.test(r.body)) queue.push(...entries.map((e) => e.url));
    else for (const e of entries) out.set(urlKey(e.url), e);
  }
  return [...out.values()];
}

function canonicalKey(href: string, base: string): string {
  try {
    return urlKey(new URL(href, base).href);
  } catch {
    return urlKey(href);
  }
}

export function toGrowthPage(html: string, url: string, status: number, host: string): GrowthPage {
  const p = parseHtmlPage(html, url);
  const key = urlKey(url);
  const sameHost = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "") === host;
    } catch {
      return false;
    }
  };
  const outlinks = [...new Set(p.resolvedHrefs.filter(sameHost).map(urlKey))].filter((k) => k !== key);
  let blockReason: GrowthPage["blockReason"];
  if (status !== 200) blockReason = "http-error";
  else if (/noindex/i.test(p.robotsMeta)) blockReason = "noindex";
  else if (p.canonical && canonicalKey(p.canonical, url) !== key) blockReason = "canonical-elsewhere";
  return {
    url,
    key,
    status,
    indexable: blockReason === undefined,
    blockReason,
    title: p.title,
    h1: p.headings.h1[0] ?? "",
    wordCount: p.contentText.split(/\s+/).filter(Boolean).length,
    h2Count: p.headings.h2.length,
    jsonLdCount: p.jsonLd.length,
    outlinks,
    simhash: simHashFromText(p.contentText),
  };
}

function uniformSample<T>(xs: T[], n: number, rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/**
 * Fetches the site's pages. A uniform sample of SOURCE pages keeps inlink
 * counts unbiased relative to each other, which is all the contrast needs.
 */
export async function crawlSite(origin: string, urls: string[], opts: CrawlOptions = {}): Promise<GrowthPage[]> {
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const cap = opts.maxPages ?? 1500;
  // Uniform (not template-stratified) on purpose: stratified sampling over-samples
  // small hub templates, which would bias inlink counts toward their targets.
  const targets = urls.length > cap ? uniformSample(urls, cap, mulberry32(opts.seed ?? 42)) : [...urls];
  const home = `${origin}/`;
  if (!targets.some((u) => urlKey(u) === urlKey(home))) targets.unshift(home);

  const pages: GrowthPage[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < targets.length) {
      const url = targets[next++];
      const r = await getText(url, opts);
      done++;
      opts.onProgress?.(done, targets.length);
      if (!r) continue;
      // Redirected pages count under their requested URL (that is what the sitemap lists).
      const page = toGrowthPage(r.status === 200 ? r.body : "", url, r.status, host);
      pages.push(page);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));
  return pages;
}
