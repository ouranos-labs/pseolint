import { describe, test, expect } from "vitest";
import { evaluateAlignment, confusionMatrix, isFlagged, median, perClassRiskStats, type ScoredAudit, type ScoreRow } from "../../calibration/score.js";
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
