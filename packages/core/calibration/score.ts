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
    if (r.siteClass === "subject") continue; // non-gated dogfood target — excluded from labeled metrics
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

export interface CalibrationBucket {
  /** Human label, e.g. "40-60". */
  label: string;
  lo: number;
  hi: number;
  /** Gated sites whose risk falls in [lo, hi) (the top band is inclusive of hi). */
  n: number;
  policyViolating: number;
  /** policyViolating / n — the empirical penalty rate of the band; NaN when empty. */
  policyRate: number;
}

export interface CalibrationMetrics {
  nReputable: number;
  nPolicy: number;
  /**
   * Mann-Whitney AUC: the probability that a randomly chosen policy-violating
   * site carries a HIGHER risk than a randomly chosen reputable site (ties count
   * 0.5). 1.0 = the score orders outcomes perfectly, 0.5 = no better than a coin,
   * < 0.5 = inverted. This is the single "is the score statistically close to the
   * real outcome" number, independent of any verdict threshold.
   */
  auc: number;
  /** min(policy risk) − max(reputable risk); ≤ 0 means the two classes overlap. */
  separationGap: number;
  /** Reputable sites whose risk ≥ the policy-violating median — over-flag-prone. */
  reputableAbovePolicyMedian: Array<{ url: string; risk: number }>;
  /** Policy-violating sites whose risk ≤ the reputable median — recall leaks. */
  policyBelowReputableMedian: Array<{ url: string; risk: number }>;
  /** Risk-band calibration: empirical penalty rate per band (monotone ⇒ calibrated). */
  buckets: CalibrationBucket[];
}

/** AUC via exhaustive pairwise comparison (ties = 0.5). O(nPos·nNeg); NaN if either class is empty. */
function computeAuc(policyRisks: number[], reputableRisks: number[]): number {
  if (policyRisks.length === 0 || reputableRisks.length === 0) return NaN;
  let wins = 0;
  for (const p of policyRisks) {
    for (const r of reputableRisks) {
      if (p > r) wins += 1;
      else if (p === r) wins += 0.5;
    }
  }
  return wins / (policyRisks.length * reputableRisks.length);
}

const CALIBRATION_BANDS: ReadonlyArray<readonly [number, number]> = [
  [0, 20], [20, 40], [40, 60], [60, 80], [80, 100],
];

/**
 * Score-vs-outcome calibration over the gated corpus (subjects excluded). Treats
 * the continuous risk as a binary classifier of the true label (policy-violating
 * = positive) and reports how well the *number itself* tracks reality — AUC,
 * class separation, the confusion-zone sites, and per-band penalty rates —
 * decoupled from the verdict threshold the confusion matrix uses.
 */
export function calibrationMetrics(rows: ScoreRow[]): CalibrationMetrics {
  const rep = rows.filter((r) => r.siteClass === "reputable");
  const pol = rows.filter((r) => r.siteClass === "policy-violating");
  const repRisks = rep.map((r) => r.audit.risk);
  const polRisks = pol.map((r) => r.audit.risk);
  const repMedian = median(repRisks);
  const polMedian = median(polRisks);

  const reputableAbovePolicyMedian = rep
    .filter((r) => r.audit.risk >= polMedian)
    .map((r) => ({ url: r.url, risk: r.audit.risk }))
    .sort((a, b) => b.risk - a.risk);
  const policyBelowReputableMedian = pol
    .filter((r) => r.audit.risk <= repMedian)
    .map((r) => ({ url: r.url, risk: r.audit.risk }))
    .sort((a, b) => a.risk - b.risk);

  const gated = [...rep, ...pol];
  const buckets: CalibrationBucket[] = CALIBRATION_BANDS.map(([lo, hi]) => {
    const inBand = gated.filter((r) => {
      const x = r.audit.risk;
      return hi === 100 ? x >= lo && x <= hi : x >= lo && x < hi;
    });
    const pv = inBand.filter((r) => r.siteClass === "policy-violating").length;
    return { label: `${lo}-${hi}`, lo, hi, n: inBand.length, policyViolating: pv, policyRate: inBand.length ? pv / inBand.length : NaN };
  });

  return {
    nReputable: rep.length,
    nPolicy: pol.length,
    auc: computeAuc(polRisks, repRisks),
    separationGap: polRisks.length && repRisks.length ? Math.min(...polRisks) - Math.max(...repRisks) : NaN,
    reputableAbovePolicyMedian,
    policyBelowReputableMedian,
    buckets,
  };
}

export interface RuleFiring {
  reputableFired: number;
  reputableTotal: number;
  policyFired: number;
  policyTotal: number;
  suppressedOn: number;
  demotedOn: number;
}

/**
 * Per-rule firing across the corpus, split by class, plus suppressed/demoted
 * attribution. A rule "fired" on a site if it emitted >=1 finding; each site is
 * counted at most once per rule.
 */
export function perRuleFiringTable(rows: ScoreRow[]): Record<string, RuleFiring> {
  const reputableTotal = rows.filter((r) => r.siteClass === "reputable").length;
  const policyTotal = rows.filter((r) => r.siteClass === "policy-violating").length;
  const table: Record<string, RuleFiring> = {};
  const ensure = (id: string): RuleFiring =>
    (table[id] ??= { reputableFired: 0, reputableTotal, policyFired: 0, policyTotal, suppressedOn: 0, demotedOn: 0 });
  for (const r of rows) {
    if (r.siteClass === "subject") continue; // tracked, not counted in labeled firing stats
    for (const id of new Set(r.audit.firedRuleIds)) {
      const e = ensure(id);
      if (r.siteClass === "reputable") e.reputableFired++;
      else e.policyFired++;
    }
    for (const id of new Set(r.audit.suppressedRuleIds)) ensure(id).suppressedOn++;
    for (const id of new Set(r.audit.demotedRuleIds)) ensure(id).demotedOn++;
  }
  return table;
}

export interface Baseline {
  /** Last committed verdict per site URL. */
  perSiteVerdict: Record<string, Verdict>;
  /** Last committed firing counts per rule. */
  perRule: Record<string, { policyFired: number; reputableFired: number }>;
}

export interface RatchetResult {
  /** HARD gate: reputable verdict worsened vs baseline, or policy-violating verdict dropped vs baseline. */
  verdictRegressions: string[];
  /** SOFT (warn): a rule's recall dropped or its reputable false-positives rose vs baseline. */
  ruleRegressions: string[];
}

/**
 * No-regression ratchet vs the committed baseline. Green at baseline by
 * construction; it only fires when a change makes the engine worse.
 */
export function ratchet(rows: ScoreRow[], sites: CorpusSite[], baseline: Baseline): RatchetResult {
  const siteByUrl = new Map(sites.map((s) => [s.url, s]));
  const verdictRegressions: string[] = [];
  for (const r of rows) {
    const s = siteByUrl.get(r.url);
    if (!s) continue;
    const curRank = VERDICT_RANK[r.audit.verdict];
    if (s.class === "reputable") {
      const base = baseline.perSiteVerdict[r.url];
      if (base && curRank > VERDICT_RANK[base]) {
        verdictRegressions.push(`${r.url}: reputable over-flag worsened — verdict ${r.audit.verdict} > baseline ${base}`);
      }
    } else if (s.class === "policy-violating") {
      const base = baseline.perSiteVerdict[r.url];
      if (base && curRank < VERDICT_RANK[base]) {
        verdictRegressions.push(`${r.url}: recall dropped — verdict ${r.audit.verdict} < baseline ${base}`);
      }
    }
    // s.class === "subject": never gated — skipped intentionally.
  }
  const ruleRegressions: string[] = [];
  const current = perRuleFiringTable(rows);
  for (const [id, base] of Object.entries(baseline.perRule)) {
    const cur = current[id];
    const curPolicy = cur?.policyFired ?? 0;
    const curRep = cur?.reputableFired ?? 0;
    if (curPolicy < base.policyFired) ruleRegressions.push(`${id}: recall dropped (${base.policyFired} -> ${curPolicy} policy sites)`);
    if (curRep > base.reputableFired) ruleRegressions.push(`${id}: false-positives rose (${base.reputableFired} -> ${curRep} reputable sites)`);
  }
  return { verdictRegressions, ruleRegressions };
}
