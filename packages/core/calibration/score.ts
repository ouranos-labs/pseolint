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

export const DEFAULT_FLAG_THRESHOLD: Verdict = "concerning";

/** Engine "positive" prediction: verdict at or above the flag threshold. */
export function isFlagged(audit: ScoredAudit, threshold: Verdict = DEFAULT_FLAG_THRESHOLD): boolean {
  return VERDICT_RANK[audit.verdict] >= VERDICT_RANK[threshold];
}

export interface Confusion {
  tp: number; fp: number; tn: number; fn: number;
  precision: number; recall: number; f1: number;
}

/** Binary classifier metrics: label-positive = policy-violating, prediction = isFlagged. */
export function confusionMatrix(rows: ScoreRow[], threshold: Verdict = DEFAULT_FLAG_THRESHOLD): Confusion {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    const flagged = isFlagged(r.audit, threshold);
    const positive = r.siteClass === "policy-violating";
    if (positive && flagged) tp++;
    else if (positive && !flagged) fn++;
    else if (!positive && flagged) fp++;
    else tn++;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { tp, fp, tn, fn, precision, recall, f1 };
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export interface ClassRisk { n: number; min: number; median: number; max: number; }
export interface RiskStats {
  reputable: ClassRisk;
  policyViolating: ClassRisk;
  /** True when the highest reputable risk is below the lowest policy-violating risk. */
  cleanlySeparated: boolean;
}

function classRisk(risks: number[]): ClassRisk {
  return {
    n: risks.length,
    min: risks.length ? Math.min(...risks) : NaN,
    median: median(risks),
    max: risks.length ? Math.max(...risks) : NaN,
  };
}

export function perClassRiskStats(rows: ScoreRow[]): RiskStats {
  const rep = rows.filter((r) => r.siteClass === "reputable").map((r) => r.audit.risk);
  const pol = rows.filter((r) => r.siteClass === "policy-violating").map((r) => r.audit.risk);
  const reputable = classRisk(rep);
  const policyViolating = classRisk(pol);
  const cleanlySeparated = rep.length > 0 && pol.length > 0 && reputable.max < policyViolating.min;
  return { reputable, policyViolating, cleanlySeparated };
}
