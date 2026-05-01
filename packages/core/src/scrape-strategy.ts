import type { RunState } from "./state.js";

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

    if (prior.findings.length > 0 || prior.findingIds.length > 0) {
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
