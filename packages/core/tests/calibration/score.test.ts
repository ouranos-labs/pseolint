import { describe, test, expect } from "vitest";
import { evaluateAlignment, confusionMatrix, isFlagged, median, perClassRiskStats, perRuleFiringTable, calibrationMetrics, ratchet, type Baseline, type ScoredAudit, type ScoreRow } from "../../calibration/score.js";
import type { CorpusSite } from "../../calibration/corpus-types.js";

function audit(partial: Partial<ScoredAudit>): ScoredAudit {
  return { verdict: "ready", risk: 0, firedRuleIds: [], suppressedRuleIds: [], demotedRuleIds: [], ...partial };
}
function site(partial: Partial<CorpusSite>): CorpusSite {
  return {
    url: "https://x.test/", vertical: "v", expectedSiteType: "t", class: "reputable",
    groundTruth: { status: "stable", trafficClass: "medium", evidence: "e" }, ...partial,
  };
}

describe("evaluateAlignment", () => {
  test("reputable passes when verdict is at or below its ceiling", () => {
    const s = site({ class: "reputable", expectedVerdictCeiling: "caution" });
    expect(evaluateAlignment(s, audit({ verdict: "caution" })).aligned).toBe(true);
    expect(evaluateAlignment(s, audit({ verdict: "ready" })).aligned).toBe(true);
  });
  test("reputable fails when verdict exceeds its ceiling", () => {
    const s = site({ class: "reputable", expectedVerdictCeiling: "caution" });
    expect(evaluateAlignment(s, audit({ verdict: "concerning" })).aligned).toBe(false);
  });
  test("policy-violating passes when verdict is at or above its floor", () => {
    const s = site({ class: "policy-violating", expectedVerdictFloor: "concerning" });
    expect(evaluateAlignment(s, audit({ verdict: "concerning" })).aligned).toBe(true);
    expect(evaluateAlignment(s, audit({ verdict: "critical" })).aligned).toBe(true);
  });
  test("policy-violating fails (under-flagged) when verdict is below its floor", () => {
    const s = site({ class: "policy-violating", expectedVerdictFloor: "concerning" });
    expect(evaluateAlignment(s, audit({ verdict: "caution" })).aligned).toBe(false);
  });
  test("subject is always 'aligned' (never gated) regardless of verdict", () => {
    const s = site({ class: "subject" });
    expect(evaluateAlignment(s, audit({ verdict: "critical" })).aligned).toBe(true);
    expect(evaluateAlignment(s, audit({ verdict: "ready" })).aligned).toBe(true);
  });
});

function row(siteClass: ScoreRow["siteClass"], verdict: ScoredAudit["verdict"]): ScoreRow {
  return { url: `https://${siteClass}-${verdict}.test/`, siteClass, audit: audit({ verdict }) };
}

describe("isFlagged", () => {
  test("flags at or above the default 'concerning' threshold", () => {
    expect(isFlagged(audit({ verdict: "concerning" }))).toBe(true);
    expect(isFlagged(audit({ verdict: "critical" }))).toBe(true);
    expect(isFlagged(audit({ verdict: "caution" }))).toBe(false);
  });
});

describe("confusionMatrix", () => {
  test("counts TP/FP/TN/FN and derives precision/recall/F1", () => {
    const rows: ScoreRow[] = [
      row("policy-violating", "critical"),   // TP
      row("policy-violating", "caution"),    // FN (under-flagged)
      row("reputable", "ready"),             // TN
      row("reputable", "concerning"),        // FP
    ];
    const m = confusionMatrix(rows);
    expect({ tp: m.tp, fp: m.fp, tn: m.tn, fn: m.fn }).toEqual({ tp: 1, fp: 1, tn: 1, fn: 1 });
    expect(m.precision).toBeCloseTo(0.5);
    expect(m.recall).toBeCloseTo(0.5);
    expect(m.f1).toBeCloseTo(0.5);
  });
  test("precision/recall/F1 are 0 (not NaN) when denominators are empty", () => {
    const m = confusionMatrix([row("reputable", "ready")]);
    expect(m.precision).toBe(0);
    expect(m.recall).toBe(0);
    expect(m.f1).toBe(0);
  });
  test("excludes subject sites from TP/FP/TN/FN", () => {
    const m = confusionMatrix([row("subject", "critical"), row("subject", "ready")]);
    expect({ tp: m.tp, fp: m.fp, tn: m.tn, fn: m.fn }).toEqual({ tp: 0, fp: 0, tn: 0, fn: 0 });
  });
});

describe("median", () => {
  test("odd and even length", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
  test("empty is NaN", () => {
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe("perClassRiskStats", () => {
  test("computes per-class min/median/max and clean-separation flag", () => {
    const rows: ScoreRow[] = [
      { url: "a", siteClass: "reputable", audit: audit({ risk: 10 }) },
      { url: "b", siteClass: "reputable", audit: audit({ risk: 20 }) },
      { url: "c", siteClass: "policy-violating", audit: audit({ risk: 60 }) },
      { url: "d", siteClass: "policy-violating", audit: audit({ risk: 80 }) },
    ];
    const s = perClassRiskStats(rows);
    expect(s.reputable.median).toBe(15);
    expect(s.policyViolating.median).toBe(70);
    expect(s.cleanlySeparated).toBe(true); // max reputable (20) < min policy (60)
  });
  test("not cleanly separated when ranges overlap", () => {
    const rows: ScoreRow[] = [
      { url: "a", siteClass: "reputable", audit: audit({ risk: 65 }) },
      { url: "c", siteClass: "policy-violating", audit: audit({ risk: 60 }) },
    ];
    expect(perClassRiskStats(rows).cleanlySeparated).toBe(false);
  });
});

describe("calibrationMetrics", () => {
  const r = (siteClass: ScoreRow["siteClass"], url: string, risk: number): ScoreRow => ({
    url, siteClass, audit: audit({ risk }),
  });

  test("perfect ordering ⇒ AUC 1.0, positive gap, no confusion-zone sites", () => {
    const rows = [r("reputable", "a", 10), r("reputable", "b", 20), r("policy-violating", "c", 60), r("policy-violating", "d", 80)];
    const m = calibrationMetrics(rows);
    expect(m.auc).toBe(1);
    expect(m.separationGap).toBe(40); // min policy 60 − max reputable 20
    expect(m.reputableAbovePolicyMedian).toEqual([]);
    expect(m.policyBelowReputableMedian).toEqual([]);
  });

  test("fully inverted ordering ⇒ AUC 0.0", () => {
    const rows = [r("reputable", "a", 80), r("reputable", "b", 90), r("policy-violating", "c", 10), r("policy-violating", "d", 20)];
    expect(calibrationMetrics(rows).auc).toBe(0);
  });

  test("ties contribute 0.5 to AUC", () => {
    const rows = [r("reputable", "a", 50), r("policy-violating", "b", 50)];
    expect(calibrationMetrics(rows).auc).toBe(0.5);
  });

  test("surfaces the overlap zone: over-flagged winners and recall-leak farms", () => {
    // reputable median = 50, policy median = 50; one winner above (60), one farm below (40)
    const rows = [
      r("reputable", "win-low", 40), r("reputable", "win-high", 60),
      r("policy-violating", "farm-low", 40), r("policy-violating", "farm-high", 60),
    ];
    const m = calibrationMetrics(rows);
    expect(m.reputableAbovePolicyMedian.map((x) => x.url)).toContain("win-high"); // 60 ≥ policy median 50
    expect(m.policyBelowReputableMedian.map((x) => x.url)).toContain("farm-low"); // 40 ≤ reputable median 50
    expect(m.separationGap).toBeLessThanOrEqual(0); // ranges overlap
  });

  test("buckets report per-band penalty rate; top band is inclusive of 100", () => {
    const rows = [
      r("reputable", "a", 10), r("policy-violating", "b", 50), r("policy-violating", "c", 100),
    ];
    const m = calibrationMetrics(rows);
    const band = (label: string) => m.buckets.find((x) => x.label === label)!;
    expect(band("0-20").policyRate).toBe(0); // only the reputable site
    expect(band("40-60").policyRate).toBe(1); // one policy site at 50
    expect(band("80-100").policyViolating).toBe(1); // risk 100 lands in the inclusive top band
  });

  test("excludes subject sites from the labeled calibration", () => {
    const rows = [r("reputable", "a", 10), r("policy-violating", "b", 80), r("subject", "mine", 99)];
    const m = calibrationMetrics(rows);
    expect(m.nReputable).toBe(1);
    expect(m.nPolicy).toBe(1);
    expect(m.buckets.reduce((s, x) => s + x.n, 0)).toBe(2); // subject not bucketed
  });
});

describe("perRuleFiringTable", () => {
  test("counts fired/suppressed/demoted per rule, split by class", () => {
    const rows: ScoreRow[] = [
      { url: "good1", siteClass: "reputable", audit: audit({ firedRuleIds: ["spam/thin-content"] }) },
      { url: "bad1", siteClass: "policy-violating", audit: audit({ firedRuleIds: ["spam/thin-content", "spam/entity-swap"] }) },
      { url: "bad2", siteClass: "policy-violating", audit: audit({ firedRuleIds: [], suppressedRuleIds: ["spam/entity-swap"], demotedRuleIds: ["aeo/citable-facts"] }) },
    ];
    const t = perRuleFiringTable(rows);
    expect(t["spam/thin-content"]).toEqual({ reputableFired: 1, reputableTotal: 1, policyFired: 1, policyTotal: 2, suppressedOn: 0, demotedOn: 0 });
    expect(t["spam/entity-swap"]).toEqual({ reputableFired: 0, reputableTotal: 1, policyFired: 1, policyTotal: 2, suppressedOn: 1, demotedOn: 0 });
    expect(t["aeo/citable-facts"].demotedOn).toBe(1);
  });
  test("a duplicate ruleId on one site counts that site once", () => {
    const rows: ScoreRow[] = [
      { url: "bad1", siteClass: "policy-violating", audit: audit({ firedRuleIds: ["spam/thin-content", "spam/thin-content"] }) },
    ];
    expect(perRuleFiringTable(rows)["spam/thin-content"].policyFired).toBe(1);
  });
  test("excludes subject-site firings (and their suppressed/demoted) from the table", () => {
    const rows: ScoreRow[] = [
      { url: "mine", siteClass: "subject", audit: audit({ firedRuleIds: ["spam/thin-content"], suppressedRuleIds: ["spam/entity-swap"] }) },
    ];
    expect(perRuleFiringTable(rows)["spam/thin-content"]?.policyFired ?? 0).toBe(0);
    expect(perRuleFiringTable(rows)["spam/entity-swap"]).toBeUndefined();
  });
});

describe("ratchet", () => {
  const sites: CorpusSite[] = [
    site({ url: "good1", class: "reputable", expectedVerdictCeiling: "caution" }),
    site({ url: "bad1", class: "policy-violating", expectedVerdictFloor: "critical" }),
  ];
  const baseline: Baseline = {
    perSiteVerdict: { good1: "caution", bad1: "concerning" },
    perRule: { "spam/entity-swap": { policyFired: 1, reputableFired: 0 } },
  };

  test("green when nothing regresses", () => {
    const rows: ScoreRow[] = [
      { url: "good1", siteClass: "reputable", audit: audit({ verdict: "caution", firedRuleIds: [] }) },
      { url: "bad1", siteClass: "policy-violating", audit: audit({ verdict: "concerning", firedRuleIds: ["spam/entity-swap"] }) },
    ];
    const r = ratchet(rows, sites, baseline);
    expect(r.verdictRegressions).toEqual([]);
    expect(r.ruleRegressions).toEqual([]);
  });
  test("flags a reputable site that worsened vs baseline", () => {
    const rows: ScoreRow[] = [
      { url: "good1", siteClass: "reputable", audit: audit({ verdict: "concerning" }) },
    ];
    expect(ratchet(rows, sites, baseline).verdictRegressions.length).toBe(1);
  });
  test("does not flag a reputable site sitting at its (already-breaching) baseline", () => {
    const debtSites: CorpusSite[] = [site({ url: "segment", class: "reputable", expectedVerdictCeiling: "caution" })];
    const debtBaseline: Baseline = { perSiteVerdict: { segment: "critical" }, perRule: {} };
    const rows: ScoreRow[] = [{ url: "segment", siteClass: "reputable", audit: audit({ verdict: "critical" }) }];
    expect(ratchet(rows, debtSites, debtBaseline).verdictRegressions).toEqual([]);
  });
  test("flags a policy-violating site whose verdict dropped below baseline (recall regression)", () => {
    const rows: ScoreRow[] = [
      { url: "bad1", siteClass: "policy-violating", audit: audit({ verdict: "caution" }) },
    ];
    expect(ratchet(rows, sites, baseline).verdictRegressions.length).toBe(1);
  });
  test("reports rule-level recall drop and FP rise as soft regressions", () => {
    const rows: ScoreRow[] = [
      { url: "bad1", siteClass: "policy-violating", audit: audit({ verdict: "concerning", firedRuleIds: [] }) }, // entity-swap stopped firing
    ];
    const r = ratchet(rows, sites, baseline);
    expect(r.ruleRegressions.some((m) => m.includes("recall dropped"))).toBe(true);
  });
  test("a subject site never produces a verdict regression", () => {
    const subjectSites: CorpusSite[] = [site({ url: "mine", class: "subject" })];
    const rows: ScoreRow[] = [{ url: "mine", siteClass: "subject", audit: audit({ verdict: "critical" }) }];
    expect(ratchet(rows, subjectSites, baseline).verdictRegressions).toEqual([]);
  });
});
