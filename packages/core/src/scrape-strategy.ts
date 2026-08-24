import type { RunState } from "./state.js";
import { clusterUrlTemplates } from "./site-classifier.js";

/** v0.5: shared default age-floor for monitoring. Single source of truth. */
export const DEFAULT_AGE_FLOOR_DAYS = 7;

/**
 * v0.5: severities that trigger an unconditional recheck under monitoring mode.
 * Open blockers and warnings are re-verified every run; informational findings
 * are carried forward without re-fetching the page. Without this gate the
 * carry-forward path would be dead code on any site with any prior finding,
 * because every URL with findings would round-trip through `recheck` and be
 * fetched anyway. Pre-v0.5 had no recheck distinction (no monitoring); the
 * gate is the load-bearing semantic difference.
 */
const RECHECK_SEVERITIES: ReadonlySet<string> = new Set(["error", "critical", "warning", "warn"]);

export type RefetchReason =
  | "new"
  | "age"
  | "ruleset"
  | "recheck"
  | "lastmod"
  | "gsc"
  | "no-signal"
  | "watched";

export type SkipReason = "unchanged";

export interface ScrapePlan {
  refetch: Map<string, RefetchReason>;
  skip: Map<string, SkipReason>;
}

export interface GscDelta {
  impressionsDelta: number; // fractional, e.g. -0.4 for -40%
  clicksDelta: number;      // absolute count
}

export interface GscThresholds {
  impressionsPct: number;   // e.g. 0.2 for ±20%
  clicksAbsolute: number;   // e.g. 5
}

export interface ScrapeStrategyInputs {
  candidateUrls: readonly string[];
  priorState: RunState | null;
  sitemapLastmodByUrl: ReadonlyMap<string, string>;
  gscDeltasByUrl?: ReadonlyMap<string, GscDelta>;
  gscThresholds?: GscThresholds;
  currentRulesetVersion: string;
  ageFloorDays: number;
  now: Date;
  /**
   * v0.5.3: caller-supplied "watched pages" list. Any URL appearing here is
   * marked refetch with reason `"watched"` and short-circuits the rest of the
   * matrix (age, ruleset, lastmod, etc.). Watched URLs that aren't already in
   * `candidateUrls` are still added to the audit set: the caller may
   * legitimately watch a page that has been removed from the sitemap and we
   * should still audit it so they find out it's gone.
   *
   * Owned by the caller (e.g. the web app's per-domain DB-backed list); the
   * engine treats it as a transient input override and never persists it on
   * `RunState`.
   */
  forceRefetchUrls?: ReadonlyArray<string>;
  /**
   * v0.5.4: optional budget cap for candidate URL selection. When set,
   * `planScrapeStrategy` will apply template-stratified sampling to narrow
   * `candidateUrls` down to this budget before running the per-URL decision
   * matrix. Watched URLs (from `forceRefetchUrls`) bypass this budget and
   * are always included regardless of the cap.
   *
   * Stratification activates only when:
   *   1. `candidateUrls.length > sampleSize * 1.5` (no point stratifying when
   *      we can take everything)
   *   2. `clusterUrlTemplates` produces ≥2 clusters AND the largest cluster
   *      covers ≤80% of the candidate pool (if one template dominates 90%+,
   *      there is nothing to balance: falls back to uniform sampling).
   *
   * When stratification doesn't activate, a simple sequential prefix slice is
   * used (preserving the caller's ordering). The decision matrix runs only
   * on the selected URLs.
   */
  sampleSize?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Threshold: stratification only activates when candidates exceed budget by this factor. */
const STRATIFY_TRIGGER_FACTOR = 1.5;

/** Threshold: largest cluster must cover ≤ this ratio for stratification to be meaningful. */
const STRATIFY_MAX_TOP_RATIO = 0.8;

/** Long-tail allocation: min(LONG_TAIL_FIXED, LONG_TAIL_FRACTION × budget). */
const LONG_TAIL_FIXED = 20;
const LONG_TAIL_FRACTION = 0.1;

/**
 * Allocate `budget` slots across template clusters proportionally, with a
 * floor of 1 per cluster. Long-tail (unmatched) URLs get a small fixed
 * allocation. Returns index lists into the original URL array.
 *
 * Preconditions (caller must verify):
 *   - clusters.length >= 2
 *   - clusters[0].ratio <= STRATIFY_MAX_TOP_RATIO
 *   - urlsWithoutCluster may be empty
 */
function stratifiedUrlSample(
  clusteredGroups: Array<{ template: string; urls: string[] }>,
  urlsWithoutCluster: string[],
  budget: number,
): string[] {
  const longTailBudget = urlsWithoutCluster.length > 0
    ? Math.min(LONG_TAIL_FIXED, Math.round(budget * LONG_TAIL_FRACTION), urlsWithoutCluster.length)
    : 0;
  const clusterBudget = budget - longTailBudget;

  const totalClustered = clusteredGroups.reduce((s, g) => s + g.urls.length, 0);

  // First pass: proportional allocation with floor of 1.
  const allocations = clusteredGroups.map((g) =>
    Math.max(1, Math.round(clusterBudget * (g.urls.length / totalClustered))),
  );

  // Second pass: trim excess to keep total within clusterBudget.
  let allocated = allocations.reduce((s, a) => s + a, 0);
  for (let i = allocations.length - 1; i >= 0 && allocated > clusterBudget; i--) {
    const canTrim = allocations[i] - 1;
    if (canTrim <= 0) continue;
    const trimBy = Math.min(canTrim, allocated - clusterBudget);
    allocations[i] -= trimBy;
    allocated -= trimBy;
  }

  const result: string[] = [];
  for (let i = 0; i < clusteredGroups.length; i++) {
    const urls = clusteredGroups[i].urls;
    const take = Math.min(allocations[i], urls.length);
    for (let j = 0; j < take; j++) result.push(urls[j]);
  }

  // Long-tail: take from front of the unmatched list.
  for (let i = 0; i < longTailBudget; i++) result.push(urlsWithoutCluster[i]);

  return result;
}

/**
 * Narrow `candidateUrls` to `sampleSize` using template-stratified sampling,
 * falling back to a sequential prefix slice when stratification conditions
 * aren't met. `watchedSet` URLs are excluded from consideration here: the
 * caller handles them separately.
 *
 * "Long-tail" definition: templates that cover ≤1% of the candidate pool OR
 * have only a single URL. These are collected into a separate bucket that gets
 * a small fixed allocation rather than a proportional one.
 */
function applyStratifiedSample(
  candidateUrls: readonly string[],
  sampleSize: number,
  watchedSet: ReadonlySet<string> | null,
): string[] {
  // Filter out watched URLs; they bypass the budget entirely.
  const pool = watchedSet
    ? candidateUrls.filter((u) => !watchedSet.has(u))
    : Array.from(candidateUrls);

  if (pool.length <= sampleSize) return pool;
  if (pool.length <= sampleSize * STRATIFY_TRIGGER_FACTOR) {
    return pool.slice(0, sampleSize);
  }

  // Check stratification eligibility.
  const clusters = clusterUrlTemplates(pool as string[]);

  // Separate significant clusters from long-tail singletons/tiny clusters.
  // A template is "significant" when it covers >1% of the pool AND has >1 URL.
  // Everything else is long-tail.
  const significantClusters = clusters.filter(
    (c) => c.count > 1 && c.ratio > 0.01,
  );
  const longTailTemplates = new Set(
    clusters.filter((c) => c.count <= 1 || c.ratio <= 0.01).map((c) => c.template),
  );

  const hasEnoughClusters = significantClusters.length >= 2;
  const topRatioOk = !hasEnoughClusters || significantClusters[0].ratio <= STRATIFY_MAX_TOP_RATIO;

  if (!hasEnoughClusters || !topRatioOk) {
    return pool.slice(0, sampleSize);
  }

  // Group URLs by template in a single pass.
  const significantTemplateSet = new Set(significantClusters.map((c) => c.template));
  const groupsByTemplate = new Map<string, string[]>();
  const longTailUrls: string[] = [];

  for (const url of pool) {
    const template = deriveTemplate(url);
    if (template !== null && significantTemplateSet.has(template)) {
      const arr = groupsByTemplate.get(template) ?? [];
      arr.push(url);
      groupsByTemplate.set(template, arr);
    } else {
      // Long-tail: either a singleton template, a URL that didn't parse, or
      // a template so rare it falls below the 1% significance threshold.
      // Only include if it's actually a long-tail template (not just failed parse).
      if (template === null || longTailTemplates.has(template)) {
        longTailUrls.push(url);
      }
    }
  }

  const orderedGroups = significantClusters.map((c) => ({
    template: c.template,
    urls: groupsByTemplate.get(c.template) ?? [],
  })).filter((g) => g.urls.length > 0);

  return stratifiedUrlSample(orderedGroups, longTailUrls, sampleSize);
}

/** Derive the template for a URL string (mirrors site-classifier's urlToTemplate). */
function deriveTemplate(url: string): string | null {
  try {
    const u = new URL(url);
    return normalizePathTemplate(u.pathname);
  } catch {
    if (typeof url === "string" && url.length > 0) {
      const path = url.split("?")[0].split("#")[0];
      return normalizePathTemplate(path.startsWith("/") ? path : `/${path}`);
    }
    return null;
  }
}

/** Simplified path normalizer matching site-classifier's normalizePathToTemplate logic. */
function normalizePathTemplate(pathname: string): string {
  let p = pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (!p.startsWith("/")) p = "/" + p;
  const segments = p.split("/").slice(1);
  if (segments.length === 0 || (segments.length === 1 && segments[0] === "")) return "/";
  const out = segments.map((seg) => {
    if (seg === "") return "";
    if (/^\d+$/.test(seg)) return ":n";
    if (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(seg)) return ":slug";
    if (seg.length >= 12 && /^[a-z]+$/.test(seg)) return ":slug";
    return seg;
  });
  return "/" + out.join("/");
}

function gscExceedsThreshold(delta: GscDelta, thresholds: GscThresholds): boolean {
  return Math.abs(delta.impressionsDelta) >= thresholds.impressionsPct
      || Math.abs(delta.clicksDelta) >= thresholds.clicksAbsolute;
}

/**
 * Returns true when the URL has at least one prior finding whose severity is
 * in `RECHECK_SEVERITIES`. Informational findings alone do NOT trigger
 * recheck: they're carried forward. Pre-v0.5 state files (or carriers from
 * older runs) only have `findingIds`; for those we can't tell severity, so we
 * assume worst-case and recheck. New runs persist full Finding records, so
 * the severity-gated path applies on the very next monitoring run.
 */
function priorFindingsTriggerRecheck(prior: RunState["urls"][string]): boolean {
  if (prior.findings.length > 0) {
    return prior.findings.some((f) => RECHECK_SEVERITIES.has(f.severity));
  }
  // Fallback: legacy entries with findingIds but no full records, be safe.
  return prior.findingIds.length > 0;
}

export function planScrapeStrategy(inputs: ScrapeStrategyInputs): ScrapePlan {
  const refetch = new Map<string, RefetchReason>();
  const skip = new Map<string, SkipReason>();

  // v0.5.3: caller-curated watched pages. A watched URL is always refetched
  // and short-circuits the rest of the matrix so the dashboard can attribute
  // the refetch to the user's explicit request rather than to "new"/"age"/etc.
  // Watched URLs absent from `candidateUrls` (e.g. removed from the sitemap)
  // are also included so the user finds out the page is gone.
  const watchedSet = inputs.forceRefetchUrls && inputs.forceRefetchUrls.length > 0
    ? new Set(inputs.forceRefetchUrls)
    : null;

  // v0.5.4: template-stratified candidate selection. Narrows candidateUrls to
  // sampleSize before the decision matrix, proportionally covering all
  // template clusters. Watched URLs are excluded from the budget calculation
  // and added unconditionally in the eval-order loop below.
  const effectiveCandidates =
    inputs.sampleSize && inputs.sampleSize > 0
      ? applyStratifiedSample(inputs.candidateUrls, inputs.sampleSize, watchedSet)
      : inputs.candidateUrls;

  const visited = new Set<string>();
  const evalOrder: string[] = [];
  if (watchedSet) {
    for (const url of watchedSet) {
      if (!visited.has(url)) {
        visited.add(url);
        evalOrder.push(url);
      }
    }
  }
  for (const url of effectiveCandidates) {
    if (!visited.has(url)) {
      visited.add(url);
      evalOrder.push(url);
    }
  }

  for (const url of evalOrder) {
    if (watchedSet && watchedSet.has(url)) {
      refetch.set(url, "watched");
      continue;
    }

    const prior = inputs.priorState?.urls[url];

    if (!prior) {
      refetch.set(url, "new");
      continue;
    }

    const ageMs = inputs.now.getTime() - Date.parse(prior.fetchedAt);
    if (Number.isFinite(ageMs) && ageMs > inputs.ageFloorDays * MS_PER_DAY) {
      refetch.set(url, "age");
      continue;
    }

    if (prior.rulesetVersion !== inputs.currentRulesetVersion) {
      refetch.set(url, "ruleset");
      continue;
    }

    if (priorFindingsTriggerRecheck(prior)) {
      refetch.set(url, "recheck");
      continue;
    }

    const lastmod = inputs.sitemapLastmodByUrl.get(url);
    if (lastmod && Date.parse(lastmod) > Date.parse(prior.fetchedAt)) {
      refetch.set(url, "lastmod");
      continue;
    }

    const gscDelta = inputs.gscDeltasByUrl?.get(url);
    if (gscDelta && inputs.gscThresholds && gscExceedsThreshold(gscDelta, inputs.gscThresholds)) {
      refetch.set(url, "gsc");
      continue;
    }

    if (!lastmod && !gscDelta) {
      refetch.set(url, "no-signal");
      continue;
    }

    skip.set(url, "unchanged");
  }

  return { refetch, skip };
}
