import { describe, test, expect } from "vitest";
import { evaluateAlignment, type ScoredAudit } from "../../calibration/score.js";
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
