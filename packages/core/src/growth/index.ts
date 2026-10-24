import { collectSitemapUrls, crawlSite, type CrawlOptions } from "./crawl.js";
import { analyze, type Analysis, type GscPageRow } from "./analyze.js";
import { buildPlan, type GrowthPlan, type PlanOptions } from "./plan.js";

export { collectSitemapUrls, crawlSite, toGrowthPage, urlKey } from "./crawl.js";
export type { GrowthPage, CrawlOptions } from "./crawl.js";
export { analyze, pagerank, FEATURES } from "./analyze.js";
export type { Analysis, AnalyzedPage, FeatureContrast, FeatureName, GscPageRow, PageFeatures, TemplateStats } from "./analyze.js";
export { buildPlan, linkPlan, expectedCtr } from "./plan.js";
export type { GrowthAction, GrowthPlan, Reward, PlanOptions } from "./plan.js";
export { parseGscPages, GSC_UI_EXPORT_CAP } from "./gsc.js";
export { submitIndexNow } from "./indexnow.js";
export { mannWhitney } from "./stats.js";
export { formatGrowthReport } from "./format.js";

export interface GrowthReport {
  origin: string;
  generatedAt: string;
  analysis: Analysis;
  plan: GrowthPlan;
}

/**
 * The growth loop: sitemap → crawl → join Search Console → learn what Google
 * rewards ON THIS SITE (each site is its own control group, so domain
 * authority/backlinks cancel out) → a concrete plan.
 */
export async function growSite(origin: string, gsc: GscPageRow[], opts: CrawlOptions & PlanOptions & { gscComplete?: boolean } = {}): Promise<GrowthReport> {
  const base = origin.replace(/\/+$/, "");
  const sitemap = await collectSitemapUrls(base, opts);
  const sitemapUrls = sitemap.map((s) => s.url);
  const pages = await crawlSite(base, sitemapUrls, opts);
  const analysis = analyze({ sitemapUrls, pages, gsc, host: new URL(base).hostname, gscComplete: opts.gscComplete });
  return { origin: base, generatedAt: new Date().toISOString(), analysis, plan: buildPlan(analysis, opts) };
}
