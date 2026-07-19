import { describe, it, expect } from "vitest";
import type { AuditSummary } from "@pseolint/core";
import { summaryToTileStates, summaryToTileMeta, severityCounts, cleanPageCount, pagesByWorstSeverity } from "./audit-tiles";

// Regression: legacy v0.3 blobs in R2 have no bucketed `issues` object — they
// carry a flat `findings` array. audit-tiles used to read `summary.issues.blockers`
// unconditionally, throwing and sending the whole /dashboard/[host] route to the
// error boundary for any host whose latest completed audit was pre-v0.4.
const legacy = {
  score: 42,
  pageCount: 3,
  categoryScores: { tech: 20 },
  findings: [
    { ruleId: "tech/canonical-consistency", severity: "error", pageUrl: "https://x.com/a" },
    { ruleId: "content/thin", severity: "warning", pageUrl: "https://x.com/b" },
  ],
} as unknown as AuditSummary;

const v04 = {
  schemaVersion: "2026-06-v0.6",
  pageCount: 3,
  issues: {
    blockers: [{ ruleId: "tech/canonical-consistency", severity: "error", pageUrl: "https://x.com/a" }],
    shouldFix: [{ ruleId: "content/thin", severity: "warning", pageUrl: "https://x.com/b" }],
    informational: [],
  },
} as unknown as AuditSummary;

describe("audit-tiles legacy-summary safety", () => {
  it("does not throw on a v0.3 summary lacking `issues`, and derives tiles from the flat findings", () => {
    expect(() => summaryToTileStates(legacy)).not.toThrow();
    const states = summaryToTileStates(legacy);
    expect(states).toHaveLength(3); // pageCount tiles
    expect(states.filter((s) => s === "error")).toHaveLength(1);
    expect(states.filter((s) => s === "warning")).toHaveLength(1);
    expect(severityCounts(legacy)).toEqual({ errors: 1, warnings: 1, infos: 0 });
    expect(cleanPageCount(legacy)).toBe(1);
    expect(pagesByWorstSeverity(legacy)).toEqual({ blockers: 1, shouldFix: 1, info: 0, clean: 1 });
    expect(summaryToTileMeta(legacy, "x.com")).toHaveLength(3);
  });

  it("still reads the bucketed issues on a v0.4 summary", () => {
    expect(severityCounts(v04)).toEqual({ errors: 1, warnings: 1, infos: 0 });
    expect(summaryToTileStates(v04)).toHaveLength(3);
  });

  it("treats a non-numeric pageCount as 0 instead of throwing RangeError", () => {
    const broken = { findings: [] } as unknown as AuditSummary;
    expect(() => summaryToTileStates(broken)).not.toThrow();
    expect(summaryToTileStates(broken)).toEqual([]);
  });
});
