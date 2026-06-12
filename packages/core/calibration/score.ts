import type { Verdict } from "../src/types.js";
import { VERDICT_RANK, type CorpusSite, type SiteClass } from "./corpus-types.js";

/** Minimal per-site audit shape the scorer needs (decoupled from AuditSummary). */
export interface ScoredAudit {
  verdict: Verdict;
  risk: number;
  /** Every rule that emitted >= 1 finding (any severity). */
  firedRuleIds: string[];
  /** Rules the site-classifier suppressed (siteClassification.suppressedRules). */
  suppressedRuleIds: string[];
  /** Rules whose severity the scoring profile demoted (appliedSeverityDemotions). */
  demotedRuleIds: string[];
}

export interface ScoreRow {
  url: string;
  siteClass: SiteClass;
  audit: ScoredAudit;
}

export interface Alignment {
  aligned: boolean;
  note: string;
}

/**
 * Report (not a gate): does the engine's verdict sit on the correct side of the
 * site's aspirational label? Reputable → verdict <= ceiling. Policy-violating →
 * verdict >= floor (falling short is expected at baseline and IS the measurement).
 */
export function evaluateAlignment(site: CorpusSite, audit: ScoredAudit): Alignment {
  const rank = VERDICT_RANK[audit.verdict];
  if (site.class === "subject") {
    return { aligned: true, note: `tracked subject — verdict ${audit.verdict} (no gate)` };
  }
  if (site.class === "reputable") {
    const ceiling = site.expectedVerdictCeiling ?? "critical";
    const aligned = rank <= VERDICT_RANK[ceiling];
    return { aligned, note: `verdict ${audit.verdict} ${aligned ? "<=" : ">"} ceiling ${ceiling}` };
  }
  const floor = site.expectedVerdictFloor ?? "concerning";
  const aligned = rank >= VERDICT_RANK[floor];
  return {
    aligned,
    note: aligned ? `verdict ${audit.verdict} >= floor ${floor}` : `verdict ${audit.verdict} < floor ${floor} (under-flagged)`,
  };
}
