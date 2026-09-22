import { describe, it, expect } from "vitest";
import type { RuleResult } from "../src/types.js";
import type { SiteClassification } from "../src/site-classifier.js";
import {
  instancesForFinding,
  scoreFromFindings,
  RULE_IMPACTS,
} from "../src/scoring.js";

describe("instancesForFinding", () => {
  it("returns clusterSize for cluster context", () => {
    const f: RuleResult = {
      ruleId: "spam/entity-swap",
      severity: "critical",
      message: "cluster",
      context: {
        type: "cluster",
        clusterSize: 40,
        members: Array.from({ length: 40 }, (_, i) => `https://x.test/${i}`),
        worstPairs: [],
        similarityRange: [0.95, 0.99],
      },
    };
    expect(instancesForFinding(f)).toBe(40);
  });

  it("returns size for group context (e.g. unique-value rollup)", () => {
    const f: RuleResult = {
      ruleId: "content/unique-value",
      severity: "warning",
      message: "group",
      context: {
        type: "group",
        size: 12,
        members: Array.from({ length: 12 }, (_, i) => `https://x.test/${i}`),
      },
    };
    expect(instancesForFinding(f)).toBe(12);
  });

  it("returns 1 when context is absent", () => {
    const f: RuleResult = {
      ruleId: "spam/thin-content",
      severity: "error",
      message: "thin",
      pageUrl: "https://x.test/1",
    };
    expect(instancesForFinding(f)).toBe(1);
  });
});

describe("scoreFromFindings cluster instance count", () => {
  it("a 40-page entity-swap cluster scores like 40 instances, not 1", () => {
    const cluster: RuleResult = {
      ruleId: "spam/entity-swap",
      severity: "critical",
      confidence: "high",
      message: "cluster",
      context: {
        type: "cluster",
        clusterSize: 40,
        members: Array.from({ length: 40 }, (_, i) => `https://x.test/${i}`),
        worstPairs: [],
        similarityRange: [0.95, 0.99],
      },
    };
    expect(instancesForFinding(cluster)).toBe(40);
    const prog: SiteClassification = {
      type: "programmatic-directory",
      confidence: 0.9,
      signals: [],
      suppressedRules: [],
    };
    const one = scoreFromFindings(
      [
        {
          ...cluster,
          context: {
            type: "cluster",
            clusterSize: 1,
            members: ["https://x.test/0"],
            worstPairs: [],
            similarityRange: [0.95, 0.99],
          },
        },
      ],
      prog,
      40,
    );
    const many = scoreFromFindings([cluster], prog, 40);
    expect(many.risk).toBeGreaterThan(one.risk);
    expect(many.risk).toBeGreaterThanOrEqual(41); // concerning band
  });

  it("blocker density counts cluster instances, not finding rows", () => {
    const cluster: RuleResult = {
      ruleId: "spam/entity-swap",
      severity: "critical",
      confidence: "high",
      message: "cluster",
      context: {
        type: "cluster",
        clusterSize: 40,
        members: Array.from({ length: 40 }, (_, i) => `https://x.test/${i}`),
        worstPairs: [],
        similarityRange: [0.95, 0.99],
      },
    };
    const prog: SiteClassification = {
      type: "programmatic-directory",
      confidence: 0.9,
      signals: [],
      suppressedRules: [],
    };
    const scored = scoreFromFindings([cluster], prog, 40);
    // 40 blockers / 40 pages → density floor 60
    expect(scored.bucketCounts.blockers).toBe(40);
    expect(scored.risk).toBeGreaterThanOrEqual(60);
  });
});

describe("RULE_IMPACTS doorway", () => {
  it("treats doorway-pattern like entity-swap (per-instance scales)", () => {
    expect(RULE_IMPACTS["spam/doorway-pattern"]).toEqual({
      baseImpact: 30,
      perInstance: 5,
      maxImpact: 80,
    });
  });
});
