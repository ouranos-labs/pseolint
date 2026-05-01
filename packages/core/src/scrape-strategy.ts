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
  | "no-signal";

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

  for (const url of inputs.candidateUrls) {
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
