import type { Verdict } from "../src/types.js";

export type SiteClass =
  | "reputable"        // gated: verdict must be <= expectedVerdictCeiling
  | "policy-violating" // gated: verdict should reach expectedVerdictFloor; ratcheted on recall
  | "subject";         // NON-gated dogfood target (e.g. paperforge.dev); tracked, never pass/fail

export type Status =
  | "winning" | "stable" | "declining"   // reputable real-world fates
  | "penalized" | "deindexed";           // policy-violating real-world fates

export type TrafficClass = "very-high" | "high" | "medium" | "low";

/** Verdict ladder rank — higher = more concerning (and higher risk). */
export const VERDICT_RANK: Record<Verdict, number> = {
  ready: 0,
  caution: 1,
  concerning: 2,
  critical: 3,
};

export interface CorpusSite {
  url: string;
  vertical: string;
  expectedSiteType: string;
  /** Three-class label. Reputable uses `expectedVerdictCeiling`; policy-violating uses `expectedVerdictFloor` + `visiblePolicies`; subject is non-gated. */
  class: SiteClass;
  /** Reputable only: engine verdict must be <= this (hard gate). */
  expectedVerdictCeiling?: Verdict;
  /** Policy-violating only: ASPIRATIONAL target — verdict should be >= this. NOT a CI gate. */
  expectedVerdictFloor?: Verdict;
  /** Policy-violating only: named spam policies the site visibly violates. */
  visiblePolicies?: string[];
  groundTruth: {
    status: Status;
    trafficClass: TrafficClass;
    evidence: string;
  };
  samplingHint?: { sampleSize?: number; noRender?: boolean };
  pinnedUrls?: string[];
  localFixtureDir?: string;
  classifierUrls?: string[];
}

export interface Corpus {
  version: string;
  rationale: string;
  sites: CorpusSite[];
}
