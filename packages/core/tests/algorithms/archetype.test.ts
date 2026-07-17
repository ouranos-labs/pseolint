import { describe, it, expect } from "vitest";
import {
  ARCHETYPES,
  ruleFamily,
  archetypeRuleProfile,
  topDriverFamily,
  hasStructuralSimilarityDriver,
  type Archetype,
  type RuleFamily,
} from "../../src/algorithms/archetype.js";
import type { RuleResult, Severity } from "../../src/types.js";

const finding = (ruleId: string, severity: Severity = "warning"): RuleResult => ({
  ruleId,
  severity,
  message: ruleId,
});

describe("ruleFamily", () => {
  it("extracts the prefix before the first slash", () => {
    expect(ruleFamily("spam/near-duplicate")).toBe("spam");
    expect(ruleFamily("aeo/answer-first")).toBe("aeo");
    expect(ruleFamily("content/thin-content")).toBe("content");
  });

  it("returns null for unknown prefixes and unprefixed ids", () => {
    expect(ruleFamily("bogus/x")).toBeNull();
    expect(ruleFamily("noslash")).toBeNull();
    expect(ruleFamily("")).toBeNull();
    expect(ruleFamily("/leading")).toBeNull();
  });

  it("only takes the FIRST segment (nested paths don't leak)", () => {
    expect(ruleFamily("spam/doorway/pattern")).toBe("spam");
  });
});

describe("archetypeRuleProfile", () => {
  it("maps every archetype exhaustively (no undefined)", () => {
    for (const a of ARCHETYPES) {
      const p = archetypeRuleProfile(a);
      expect(p).toBeDefined();
      expect(Array.isArray(p.primary)).toBe(true);
      expect(typeof p.clusterTolerant).toBe("boolean");
    }
  });

  it("marks exactly the cluster-inherent archetypes as clusterTolerant", () => {
    const tolerant = ARCHETYPES.filter((a) => archetypeRuleProfile(a).clusterTolerant);
    expect([...tolerant].sort()).toEqual(["aggregator", "directory", "location-pages"]);
  });

  it("never lists a family as both primary and tolerant (contradiction guard)", () => {
    for (const a of ARCHETYPES) {
      const { primary, tolerant } = archetypeRuleProfile(a);
      const overlap = primary.filter((f) => tolerant.includes(f));
      expect(overlap, `overlap for ${a}`).toEqual([]);
    }
  });

  it("only references known rule families", () => {
    const known: RuleFamily[] = ["spam", "content", "aeo", "tech", "schema", "data", "links", "cannibal"];
    for (const a of ARCHETYPES) {
      const { primary, tolerant } = archetypeRuleProfile(a);
      for (const f of [...primary, ...tolerant]) expect(known).toContain(f);
    }
  });

  it("puts spam in primary for the cluster-tolerant archetypes (the tier-3 lever)", () => {
    for (const a of ["directory", "location-pages", "aggregator"] as Archetype[]) {
      expect(archetypeRuleProfile(a).primary).toContain("spam");
    }
  });
});

describe("topDriverFamily", () => {
  it("returns null when there are no family-attributable findings", () => {
    expect(topDriverFamily([])).toBeNull();
    expect(topDriverFamily([finding("bogus/x"), finding("noslash")])).toBeNull();
  });

  it("returns the sole family when only one is present", () => {
    expect(topDriverFamily([finding("spam/near-duplicate"), finding("spam/doorway")])).toBe("spam");
  });

  it("weights by severity — one critical outranks several warnings in another family", () => {
    const findings = [
      finding("content/thin", "warning"),
      finding("content/thin", "warning"),
      finding("content/thin", "warning"),
      finding("spam/near-duplicate", "critical"),
    ];
    // content: 3×(1+1)=6 ; spam: 1×(3+1)=4 → content wins here (many warnings beat one critical)
    expect(topDriverFamily(findings)).toBe("content");
    // But two criticals flip it:
    expect(topDriverFamily([...findings, finding("spam/entity-swap", "critical")])).toBe("spam");
  });

  it("ignores unknown families when picking the top", () => {
    expect(topDriverFamily([finding("bogus/x", "critical"), finding("aeo/answer-first", "info")])).toBe("aeo");
  });

  it("breaks ties by first appearance (stable)", () => {
    // spam and links each get exactly one warning (weight 2). spam appears first.
    expect(topDriverFamily([finding("spam/x", "warning"), finding("links/y", "warning")])).toBe("spam");
    expect(topDriverFamily([finding("links/y", "warning"), finding("spam/x", "warning")])).toBe("links");
  });
});

describe("hasStructuralSimilarityDriver", () => {
  it("is true when near-duplicate or entity-swap fired at error+ severity", () => {
    expect(hasStructuralSimilarityDriver([finding("spam/near-duplicate", "critical")])).toBe(true);
    expect(hasStructuralSimilarityDriver([finding("spam/entity-swap", "error")])).toBe(true);
  });

  it("is false when those rules only fired at warning/info (below the bar)", () => {
    expect(hasStructuralSimilarityDriver([finding("spam/near-duplicate", "warning")])).toBe(false);
    expect(hasStructuralSimilarityDriver([finding("spam/entity-swap", "info")])).toBe(false);
  });

  it("is false for other spam rules (doorway/thin) — only the structural pair counts", () => {
    expect(hasStructuralSimilarityDriver([finding("spam/doorway", "critical"), finding("spam/thin-content", "critical")])).toBe(false);
  });

  it("is false with no findings", () => {
    expect(hasStructuralSimilarityDriver([])).toBe(false);
  });
});
