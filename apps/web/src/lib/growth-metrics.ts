import type { GscPageQueryRow } from "@/lib/gsc";
import { allSymptomSlugs } from "@/lib/marketing-symptoms";
import { MARKETING_RULES } from "@/lib/marketing-rules";
import { MARKETING_TOOLS } from "@/lib/marketing-tools";

/** Path prefixes of the indexable growth page-sets we self-measure. */
export const GROWTH_PREFIXES = ["/symptoms", "/rules", "/tools"] as const;

/** One row destined for the `growthSearchMetrics` table. query="" = page-level. */
export interface GrowthMetricRow {
  url: string;
  query: string;
  impressions: number;
  clicks: number;
  positionAvg: number | null;
  ctrAvg: number | null;
}

interface AggregateOptions {
  growthPrefixes: readonly string[];
  /** Max page+query rows kept per page (by impressions). Default 10. */
  topQueriesPerPage?: number;
}

function pathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function isGrowthUrl(url: string, prefixes: readonly string[]): boolean {
  const path = pathOf(url);
  if (!path) return false;
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Transform raw GSC (page,query) rows into table-ready rows:
 *  - one page-level row per URL (query=""), with impression-weighted avg
 *    position and derived CTR;
 *  - the top-N (page,query) rows per URL by impressions.
 * Pure: no I/O. URLs outside `growthPrefixes` and unparseable URLs are dropped.
 */
export function aggregateGrowthRows(
  rows: readonly GscPageQueryRow[],
  opts: AggregateOptions,
): { pageRows: GrowthMetricRow[]; pageQueryRows: GrowthMetricRow[] } {
  const topN = opts.topQueriesPerPage ?? 10;
  const byUrl = new Map<string, GscPageQueryRow[]>();
  for (const r of rows) {
    if (!isGrowthUrl(r.url, opts.growthPrefixes)) continue;
    const list = byUrl.get(r.url) ?? [];
    list.push(r);
    byUrl.set(r.url, list);
  }

  const pageRows: GrowthMetricRow[] = [];
  const pageQueryRows: GrowthMetricRow[] = [];

  for (const [url, list] of byUrl) {
    const impressions = list.reduce((s, r) => s + r.impressions, 0);
    const clicks = list.reduce((s, r) => s + r.clicks, 0);
    const weightedPos = list.reduce((s, r) => s + r.position * r.impressions, 0);
    pageRows.push({
      url,
      query: "",
      impressions,
      clicks,
      positionAvg: impressions > 0 ? weightedPos / impressions : null,
      ctrAvg: impressions > 0 ? clicks / impressions : null,
    });

    const top = [...list].sort((a, b) => b.impressions - a.impressions).slice(0, topN);
    for (const r of top) {
      pageQueryRows.push({
        url,
        query: r.query,
        impressions: r.impressions,
        clicks: r.clicks,
        positionAvg: r.impressions > 0 ? r.position : null,
        ctrAvg: r.impressions > 0 ? r.ctr : null,
      });
    }
  }

  return { pageRows, pageQueryRows };
}

export interface IndexationSummary {
  published: number;
  withImpressions: number;
  indexationRatePct: number;
}

/**
 * How many published growth URLs are actually surfacing in search (have any
 * impressions). `publishedPaths` are site-relative paths (e.g. "/symptoms/x");
 * `pageRows` carry absolute URLs, so we compare on pathname.
 */
export function growthIndexationSummary(
  publishedPaths: readonly string[],
  pageRows: readonly GrowthMetricRow[],
): IndexationSummary {
  const surfacing = new Set<string>();
  for (const r of pageRows) {
    if (r.query !== "") continue;
    if (r.impressions <= 0) continue;
    const path = pathOf(r.url);
    if (path) surfacing.add(path);
  }
  const published = publishedPaths.length;
  const withImpressions = publishedPaths.filter((p) => surfacing.has(p)).length;
  const indexationRatePct = published > 0 ? Math.round((withImpressions / published) * 100) : 0;
  return { published, withImpressions, indexationRatePct };
}

/** All indexable growth URLs we publish, as site-relative paths. */
export function publishedGrowthUrls(): string[] {
  return [
    ...allSymptomSlugs().map((s) => `/symptoms/${s}`),
    ...MARKETING_RULES.map((r) => `/rules/${r.slug}`),
    ...MARKETING_TOOLS.map((t) => `/tools/${t.slug}`),
  ];
}
