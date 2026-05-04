import type { RunState } from "./state.js";

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
   * v0.5.3 — caller-supplied "watched pages" list. Any URL appearing here is
   * marked refetch with reason `"watched"` and short-circuits the rest of the
   * matrix (age, ruleset, lastmod, etc.). Watched URLs that aren't already in
   * `candidateUrls` are still added to the audit set — the caller may
   * legitimately watch a page that has been removed from the sitemap and we
   * should still audit it so they find out it's gone.
   *
   * Owned by the caller (e.g. the web app's per-domain DB-backed list); the
   * engine treats it as a transient input override and never persists it on
   * `RunState`.
   */
  forceRefetchUrls?: ReadonlyArray<string>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function gscExceedsThreshold(delta: GscDelta, thresholds: GscThresholds): boolean {
  return Math.abs(delta.impressionsDelta) >= thresholds.impressionsPct
      || Math.abs(delta.clicksDelta) >= thresholds.clicksAbsolute;
}

/**
 * Returns true when the URL has at least one prior finding whose severity is
 * in `RECHECK_SEVERITIES`. Informational findings alone do NOT trigger
 * recheck — they're carried forward. Pre-v0.5 state files (or carriers from
 * older runs) only have `findingIds`; for those we can't tell severity, so we
 * assume worst-case and recheck. New runs persist full Finding records, so
 * the severity-gated path applies on the very next monitoring run.
 */
function priorFindingsTriggerRecheck(prior: RunState["urls"][string]): boolean {
  if (prior.findings.length > 0) {
    return prior.findings.some((f) => RECHECK_SEVERITIES.has(f.severity));
  }
  // Fallback: legacy entries with findingIds but no full records — be safe.
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
  for (const url of inputs.candidateUrls) {
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
