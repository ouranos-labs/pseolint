import type { Verdict } from "../src/types.js";
import type { Archetype } from "../src/algorithms/archetype.js";

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
  /**
   * pSEO archetype label for tier-3 intent-moderation calibration. Optional —
   * when unset, the intent calibrator derives it from `expectedSiteType`
   * (programmatic-directory → directory). Set explicitly to distinguish
   * location-pages / aggregator from a plain directory.
   */
  archetype?: Archetype;
  /** Policy-violating only: ASPIRATIONAL target — verdict should be >= this. NOT a CI gate. */
  expectedVerdictFloor?: Verdict;
  /** Policy-violating only: named spam policies the site visibly violates. */
  visiblePolicies?: string[];
  /**
   * Whether the policy violation is visible in the fetched page content.
   * `off-page-only` = the abuse lives in the host relationship or domain history
   * (site-reputation parasites) and is invisible to an on-page audit by
   * construction — an on-page score CANNOT detect it. Unset = on-page-detectable.
   * Used to report the engine's *addressable* calibration ceiling separately
   * from the structurally-undetectable cases.
   */
  detectability?: "on-page" | "off-page-only";
  /**
   * `true` for hand-constructed fixtures (e.g. doorwayspam.example) that exist
   * to assert a recall floor on a specific rule, NOT real-world sites. Synthetic
   * sites are excluded from real-world recall/precision — catching one proves the
   * rule fires, not that the engine tracks reality — but kept as a must-catch floor.
   */
  synthetic?: boolean;
  groundTruth: {
    status: Status;
    trafficClass: TrafficClass;
    evidence: string;
    /** URL backing the evidence (traffic study, SEO case study, enforcement list). */
    source?: string;
    /** ISO date the label was last verified — labels decay; re-verify periodically. */
    asOf?: string;
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
