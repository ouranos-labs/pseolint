import { describe, it, expect } from "vitest";
import { collectRuleStats } from "@/lib/rule-stats";

const summary = (issues: unknown) => ({ issues }) as never;

describe("collectRuleStats", () => {
  it("counts findings per rule and keeps the worst severity", () => {
    const stats = collectRuleStats(summary({
      blockers: [{ ruleId: "spam/entity-swap", severity: "critical" }],
      shouldFix: [
        { ruleId: "spam/entity-swap", severity: "warning" },
        { ruleId: "content/citation-coverage", severity: "warning" },
      ],
      informational: [{ ruleId: "content/citation-coverage", severity: "info" }],
    }));
    const byId = Object.fromEntries(stats.map((s) => [s.ruleId, s]));
    expect(byId["spam/entity-swap"]).toEqual({ ruleId: "spam/entity-swap", severity: "critical", findingCount: 2 });
    expect(byId["content/citation-coverage"]).toEqual({ ruleId: "content/citation-coverage", severity: "warning", findingCount: 2 });
  });

  it("counts the informational bucket — it is most of the corpus", () => {
    const stats = collectRuleStats(summary({ blockers: [], shouldFix: [], informational: [{ ruleId: "aeo/llms-txt", severity: "info" }] }));
    expect(stats).toEqual([{ ruleId: "aeo/llms-txt", severity: "info", findingCount: 1 }]);
  });

  it("carries no page-identifying data through", () => {
    const stats = collectRuleStats(summary({
      blockers: [{ ruleId: "r", severity: "error", pageUrl: "https://x.test/secret", message: "leaky", relatedUrls: ["https://x.test/a"] }],
    }));
    expect(JSON.stringify(stats)).not.toContain("x.test");
    expect(JSON.stringify(stats)).not.toContain("leaky");
  });

  it("survives malformed or absent input", () => {
    expect(collectRuleStats(null)).toEqual([]);
    expect(collectRuleStats(undefined)).toEqual([]);
    expect(collectRuleStats(summary(undefined))).toEqual([]);
    expect(collectRuleStats(summary({ blockers: "not-an-array" }))).toEqual([]);
    expect(collectRuleStats(summary({ blockers: [{ severity: "error" }, { ruleId: 42 }] }))).toEqual([]);
  });

  it("defaults an unknown severity to info rather than dropping the finding", () => {
    const stats = collectRuleStats(summary({ blockers: [{ ruleId: "r", severity: "kaboom" }] }));
    expect(stats).toEqual([{ ruleId: "r", severity: "info", findingCount: 1 }]);
  });
});
