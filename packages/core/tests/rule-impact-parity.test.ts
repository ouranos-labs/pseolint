import { describe, it, expect } from "vitest";

import { RULE_SCOPE } from "../src/rules/scope.js";
import { RULE_IMPACTS, DEFAULT_RULE_IMPACT } from "../src/scoring.js";

/**
 * `RULE_IMPACTS` lives in `scoring.ts` only (shared by the site path in
 * `auditor.ts` and the template path in `per-template-scoring.ts`). Falling
 * back to `DEFAULT_RULE_IMPACT` is never deliberate: it is what shipping a
 * rule and forgetting the table looks like.
 */
describe("RULE_IMPACTS coverage", () => {
  /**
   * Keep this empty. A rule with no entry silently runs on DEFAULT_RULE_IMPACT
   * (5/1/25), which saturates its 25-point cap on any rule that fires once per
   * page, so one template defect scores like 25 independent ones.
   */
  const KNOWN_UNCOVERED: string[] = [];

  it("exports a non-trivial shared table", () => {
    expect(Object.keys(RULE_IMPACTS).length).toBeGreaterThan(40);
    expect(DEFAULT_RULE_IMPACT).toEqual({ baseImpact: 5, perInstance: 1, maxImpact: 25 });
  });

  it("has an explicit impact for every scored rule", () => {
    const scored = Object.keys(RULE_SCOPE).filter((id) => !id.startsWith("audit/"));
    const uncovered = scored.filter((id) => !(id in RULE_IMPACTS)).sort();
    expect(uncovered).toEqual([...KNOWN_UNCOVERED].sort());
  });

  it("keeps every impact entry pointed at a rule id that is actually dispatched", () => {
    const KNOWN_DEAD: string[] = [];
    const dead = Object.keys(RULE_IMPACTS).filter((id) => !(id in RULE_SCOPE)).sort();
    expect(dead).toEqual([...KNOWN_DEAD].sort());
  });

  it("never lets a rule with a zero per-instance step carry a cap above its base", () => {
    // perInstance 0 means "the count is the sample size, not a defect count"
    // (the tech/hreflang-consistency lesson). A cap above the base would then be
    // unreachable and misleading about what the rule can contribute.
    for (const [id, i] of Object.entries(RULE_IMPACTS)) {
      if (i.perInstance === 0 && i.maxImpact !== undefined) {
        expect(i.maxImpact, `${id}: perInstance 0 but cap > base`).toBe(i.baseImpact);
      }
    }
  });
});
