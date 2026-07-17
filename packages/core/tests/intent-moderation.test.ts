import { describe, it, expect } from "vitest";
import { shiftVerdictForIntent } from "../src/auditor.js";
import { ARCHETYPES, type Archetype } from "../src/algorithms/archetype.js";
import type { Verdict } from "../src/types.js";

const LADDER: Verdict[] = ["ready", "caution", "concerning", "critical"];
const idx = (v: Verdict) => LADDER.indexOf(v);

const CLUSTER_TOLERANT: Archetype[] = ["directory", "location-pages", "aggregator"];
const NON_TOLERANT: Archetype[] = ["comparison", "glossary", "programmatic-blog", "other"];

// The condition under which tier 3 softens: cluster-tolerant archetype, a
// structural-similarity driver (near-dup/entity-swap fired), genuine effort (>= 10).
const soften = (verdict: Verdict, archetype: Archetype) =>
  shiftVerdictForIntent(verdict, { archetype, effortScore: 20, structuralDriver: true });

describe("shiftVerdictForIntent — the active soften path", () => {
  it("softens exactly one tier for a cluster-tolerant archetype with a structural driver and real effort", () => {
    expect(soften("critical", "directory")).toBe("concerning");
    expect(soften("concerning", "location-pages")).toBe("caution");
    expect(soften("caution", "aggregator")).toBe("ready");
    expect(soften("caution", "directory")).toBe("ready");
  });

  it("clamps at 'ready' — soften can't go below the floor", () => {
    expect(soften("ready", "directory")).toBe("ready");
  });

  it("softens for EVERY cluster-tolerant archetype", () => {
    for (const a of CLUSTER_TOLERANT) {
      expect(idx(soften("concerning", a)), a).toBe(idx("caution"));
    }
  });
});

describe("shiftVerdictForIntent — no-op guards (must NOT soften)", () => {
  it("does nothing for non-cluster-tolerant archetypes even with a structural driver + high effort", () => {
    for (const a of NON_TOLERANT) {
      expect(soften("critical", a), a).toBe("critical");
    }
  });

  it("does nothing when there is no structural-similarity driver", () => {
    expect(shiftVerdictForIntent("critical", { archetype: "directory", effortScore: 20, structuralDriver: false })).toBe(
      "critical",
    );
  });

  it("does nothing when archetype is absent", () => {
    expect(shiftVerdictForIntent("critical", { archetype: null, effortScore: 20, structuralDriver: true })).toBe(
      "critical",
    );
    expect(shiftVerdictForIntent("critical", { archetype: undefined, effortScore: 20, structuralDriver: true })).toBe(
      "critical",
    );
  });

  it("respects the farm-floor effort gate (>= 10 softens, below does not)", () => {
    const at = (e: number | null | undefined) =>
      shiftVerdictForIntent("concerning", { archetype: "directory", effortScore: e, structuralDriver: true });
    expect(at(10)).toBe("caution"); // boundary: softens
    expect(at(9.99)).toBe("concerning"); // just under: no-op
    expect(at(0)).toBe("concerning"); // farm zone: no-op (effort already escalated it)
    expect(at(null)).toBe("concerning");
    expect(at(undefined)).toBe("concerning");
    expect(at(NaN)).toBe("concerning");
  });
});

describe("shiftVerdictForIntent — the hard invariant: NEVER escalates", () => {
  it("no combination of inputs ever produces a worse verdict, or softens by more than one tier", () => {
    const efforts = [undefined, null, NaN, -5, 0, 3, 9, 10, 25, 100, 500];
    for (const v of LADDER) {
      for (const a of [...ARCHETYPES, null, undefined] as (Archetype | null | undefined)[]) {
        for (const e of efforts) {
          for (const structuralDriver of [true, false]) {
            const out = shiftVerdictForIntent(v, { archetype: a, effortScore: e, structuralDriver });
            expect(idx(out), `${v}/${a}/${e}/${structuralDriver} escalated`).toBeLessThanOrEqual(idx(v));
            expect(idx(v) - idx(out)).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});
