import { detectTemplates } from "../template-detection.js";
import { urlKey, type GrowthPage } from "./crawl.js";
import { mannWhitney, median, normalCdf } from "./stats.js";

export interface GscPageRow {
  url: string;
  impressions: number;
  clicks: number;
  position?: number;
}

export interface PageFeatures {
  inlinks: number;
  pagerank: number;
  wordCount: number;
  h2Count: number;
  jsonLdCount: number;
  outlinks: number;
  /** Highest simhash similarity to another page of the same template (1 = clone). */
  siblingSimilarity: number;
  titleLength: number;
  pathDepth: number;
}

export type FeatureName = keyof PageFeatures;
export const FEATURES: FeatureName[] = ["inlinks", "pagerank", "wordCount", "h2Count", "jsonLdCount", "outlinks", "siblingSimilarity", "titleLength", "pathDepth"];

export interface AnalyzedPage {
  url: string;
  key: string;
  template: string;
  shown: boolean;
  /** False when not in GSC data AND that data is truncated: shown-or-not is unknown. */
  known: boolean;
  impressions: number;
  clicks: number;
  position?: number;
  indexable: boolean;
  blockReason?: GrowthPage["blockReason"];
  title: string;
  h1: string;
  outlinks: string[];
  features: PageFeatures;
}

export interface FeatureContrast {
  feature: FeatureName;
  /** P(shown page's value > ignored page's value). */
  auc: number;
  p: number;
  shownMedian: number;
  ignoredMedian: number;
}

export interface TemplateStats {
  template: string;
  sitemapUrls: number;
  shownUrls: number;
  /** Share of the template's sitemap URLs that earned ≥1 impression: the pSEO number that matters. */
  showRate: number;
  impressions: number;
  clicks: number;
  crawled: number;
  blocked: number;
  contrasts: FeatureContrast[];
}

const PR_DAMPING = 0.85;

export function pagerank(nodes: string[], edges: Map<string, string[]>, iterations = 40): Map<string, number> {
  const n = nodes.length;
  const idx = new Map(nodes.map((k, i) => [k, i]));
  let pr = new Float64Array(n).fill(1 / n);
  const out = nodes.map((k) => (edges.get(k) ?? []).map((t) => idx.get(t)).filter((i): i is number => i !== undefined));
  for (let it = 0; it < iterations; it++) {
    const nextPr = new Float64Array(n).fill((1 - PR_DAMPING) / n);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (out[i].length === 0) dangling += pr[i];
      else for (const j of out[i]) nextPr[j] += (PR_DAMPING * pr[i]) / out[i].length;
    }
    for (let i = 0; i < n; i++) nextPr[i] += (PR_DAMPING * dangling) / n;
    pr = nextPr;
  }
  // Scaled so 1.0 = an average page: readable and comparable across site sizes.
  return new Map(nodes.map((k, i) => [k, pr[i] * n]));
}

function popcount32(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function siblingSimilarities(pages: GrowthPage[]): Map<string, number> {
  // ponytail: O(n²) within a template; fine to ~5k pages per template, LSH buckets past that.
  const hi = pages.map((p) => Number(p.simhash >> 32n) >>> 0);
  const lo = pages.map((p) => Number(p.simhash & 0xffffffffn) >>> 0);
  const best = new Array<number>(pages.length).fill(0);
  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const sim = 1 - (popcount32(hi[i] ^ hi[j]) + popcount32(lo[i] ^ lo[j])) / 64;
      if (sim > best[i]) best[i] = sim;
      if (sim > best[j]) best[j] = sim;
    }
  }
  return new Map(pages.map((p, i) => [p.key, best[i]]));
}

export interface AnalyzeInput {
  sitemapUrls: string[];
  pages: GrowthPage[];
  gsc: GscPageRow[];
  /** Only GSC rows on this host (www-agnostic) count. Defaults to the sitemap's host. */
  host?: string;
  /**
   * False when the GSC data may omit shown pages (the UI export caps at 1,000
   * rows). Absent pages are then unknown, not ignored. Default true.
   */
  gscComplete?: boolean;
}

export interface Analysis {
  pages: AnalyzedPage[];
  templates: TemplateStats[];
  site: { sitemapUrls: number; shownUrls: number; showRate: number; impressions: number; clicks: number; contrasts: FeatureContrast[] };
  /** Pages with impressions that are not in the sitemap (often the real winners). */
  shownOutsideSitemapRows: GscPageRow[];
  /** See AnalyzeInput.gscComplete. When false, show rates are lower bounds. */
  gscComplete: boolean;
}

export function analyze({ sitemapUrls, pages, gsc, host, gscComplete = true }: AnalyzeInput): Analysis {
  const siteHost = (host ?? urlKey(sitemapUrls[0] ?? pages[0]?.url ?? "").split("/")[0]).replace(/^www\./, "");
  const gscByKey = new Map<string, GscPageRow>();
  for (const row of gsc) {
    const k = urlKey(row.url);
    if (k.split("/")[0] !== siteHost) continue;
    const prev = gscByKey.get(k);
    gscByKey.set(k, prev ? { ...prev, impressions: prev.impressions + row.impressions, clicks: prev.clicks + row.clicks } : row);
  }
  const sitemapKeys = new Set(sitemapUrls.map(urlKey));
  const universe = [...new Set([...sitemapUrls, ...pages.map((p) => p.url)])];
  const templateOf = new Map<string, string>();
  for (const c of detectTemplates(universe)) for (const u of c.urls) templateOf.set(urlKey(u), c.signature);

  // Link graph over crawled pages only (targets may be uncrawled).
  const edges = new Map(pages.map((p) => [p.key, p.outlinks]));
  const nodes = [...new Set([...pages.map((p) => p.key), ...pages.flatMap((p) => p.outlinks)])];
  const pr = pagerank(nodes, edges);
  const inlinks = new Map<string, number>();
  for (const p of pages) for (const t of p.outlinks) inlinks.set(t, (inlinks.get(t) ?? 0) + 1);

  const byTemplate = new Map<string, GrowthPage[]>();
  for (const p of pages) {
    const t = templateOf.get(p.key) ?? "(other)";
    byTemplate.set(t, [...(byTemplate.get(t) ?? []), p]);
  }
  const simByKey = new Map<string, number>();
  for (const group of byTemplate.values()) for (const [k, v] of siblingSimilarities(group)) simByKey.set(k, v);

  const analyzed: AnalyzedPage[] = pages.map((p) => {
    const g = gscByKey.get(p.key);
    let path = "/";
    try {
      path = new URL(p.url).pathname;
    } catch {
      /* keep root */
    }
    return {
      url: p.url,
      key: p.key,
      template: templateOf.get(p.key) ?? "(other)",
      shown: (g?.impressions ?? 0) > 0,
      known: gscComplete || (g?.impressions ?? 0) > 0,
      impressions: g?.impressions ?? 0,
      clicks: g?.clicks ?? 0,
      position: g?.position,
      indexable: p.indexable,
      blockReason: p.blockReason,
      title: p.title,
      h1: p.h1,
      outlinks: p.outlinks,
      features: {
        inlinks: inlinks.get(p.key) ?? 0,
        pagerank: pr.get(p.key) ?? 0,
        wordCount: p.wordCount,
        h2Count: p.h2Count,
        jsonLdCount: p.jsonLdCount,
        outlinks: p.outlinks.length,
        siblingSimilarity: simByKey.get(p.key) ?? 0,
        titleLength: p.title.length,
        pathDepth: path.split("/").filter(Boolean).length,
      },
    };
  });

  const contrastOf = (group: AnalyzedPage[]): FeatureContrast[] => {
    const eligible = group.filter((p) => p.indexable && p.known);
    const shown = eligible.filter((p) => p.shown);
    const ignored = eligible.filter((p) => !p.shown);
    if (shown.length < 5 || ignored.length < 5) return [];
    return FEATURES.map((f) => {
      const a = shown.map((p) => p.features[f]);
      const b = ignored.map((p) => p.features[f]);
      return { feature: f, ...mannWhitney(a, b), shownMedian: median(a), ignoredMedian: median(b) };
    });
  };

  const templates: TemplateStats[] = [];
  const templateNames = new Set([...templateOf.values(), ...analyzed.map((p) => p.template)]);
  for (const t of templateNames) {
    const sm = sitemapUrls.filter((u) => (templateOf.get(urlKey(u)) ?? "(other)") === t);
    const shownKeys = sm.filter((u) => (gscByKey.get(urlKey(u))?.impressions ?? 0) > 0);
    const group = analyzed.filter((p) => p.template === t);
    const rows = sm.map((u) => gscByKey.get(urlKey(u))).filter((r): r is GscPageRow => r !== undefined);
    templates.push({
      template: t,
      sitemapUrls: sm.length,
      shownUrls: shownKeys.length,
      showRate: sm.length ? shownKeys.length / sm.length : 0,
      impressions: rows.reduce((s, r) => s + r.impressions, 0),
      clicks: rows.reduce((s, r) => s + r.clicks, 0),
      crawled: group.length,
      blocked: group.filter((p) => !p.indexable).length,
      contrasts: contrastOf(group),
    });
  }
  templates.sort((a, b) => b.sitemapUrls - a.sitemapUrls);

  // Site-level contrast stratified by template (van Elteren-style weighting),
  // so "product pages rank better than tag pages" never masquerades as a feature effect.
  const siteContrasts: FeatureContrast[] = FEATURES.map((f) => {
    let wSum = 0;
    let aucSum = 0;
    let zSum = 0;
    let zW = 0;
    for (const t of templates) {
      const c = t.contrasts.find((x) => x.feature === f);
      if (!c) continue;
      const group = analyzed.filter((p) => p.template === t.template && p.indexable && p.known);
      const n1 = group.filter((p) => p.shown).length;
      const n2 = group.length - n1;
      const w = (n1 * n2) / (n1 + n2 + 1);
      wSum += w;
      aucSum += w * c.auc;
      const z = Math.sign(c.auc - 0.5) * invNormal(1 - c.p / 2);
      zSum += Math.sqrt(w) * z;
      zW += w;
    }
    if (wSum === 0) return { feature: f, auc: 0.5, p: 1, shownMedian: 0, ignoredMedian: 0 };
    const z = zSum / Math.sqrt(zW);
    const eligible = analyzed.filter((p) => p.indexable && p.known);
    return {
      feature: f,
      auc: aucSum / wSum,
      p: Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))),
      shownMedian: median(eligible.filter((p) => p.shown).map((p) => p.features[f])),
      ignoredMedian: median(eligible.filter((p) => !p.shown).map((p) => p.features[f])),
    };
  });

  const siteRows = [...gscByKey.entries()];
  return {
    pages: analyzed,
    templates,
    site: {
      sitemapUrls: sitemapUrls.length,
      shownUrls: sitemapUrls.filter((u) => (gscByKey.get(urlKey(u))?.impressions ?? 0) > 0).length,
      showRate: sitemapUrls.length ? sitemapUrls.filter((u) => (gscByKey.get(urlKey(u))?.impressions ?? 0) > 0).length / sitemapUrls.length : 0,
      impressions: siteRows.reduce((s, [, r]) => s + r.impressions, 0),
      clicks: siteRows.reduce((s, [, r]) => s + r.clicks, 0),
      contrasts: siteContrasts,
    },
    gscComplete,
    shownOutsideSitemapRows: siteRows.filter(([k, r]) => r.impressions > 0 && !sitemapKeys.has(k)).map(([, r]) => r).sort((x, y) => y.impressions - x.impressions),
  };
}

// Acklam's rational approximation; only used to turn p back into z for Stouffer.
function invNormal(p: number): number {
  const q = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - 0.02425) return -invNormal(1 - q);
  const r = q - 0.5;
  const s = r * r;
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}
