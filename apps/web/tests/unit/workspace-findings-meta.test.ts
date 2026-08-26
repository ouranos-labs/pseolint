import { describe, it, expect } from "vitest";
import type { AuditSummary } from "@pseolint/core";
import { buildFindingsMeta } from "@/app/dashboard/[host]/_data";

/**
 * buildFindingsMeta keys report rule-results the same way findingsState groups
 * rows: by inferred URL template, not by URL. Two consumers depend on the keys
 * matching exactly, the run-diff's carried-forward filter and the findings
 * panel's enrichment, so a drift here silently mislabels "confirmed fixed".
 */
function summaryOf(
  buckets: Partial<Record<"blockers" | "shouldFix" | "informational", unknown[]>>,
): AuditSummary {
  return {
    issues: { blockers: [], shouldFix: [], informational: [], ...buckets },
  } as unknown as AuditSummary;
}

describe("buildFindingsMeta", () => {
  it("returns an empty map for a missing summary", () => {
    expect(buildFindingsMeta(null).size).toBe(0);
  });

  it("returns an empty map when the summary has no issues", () => {
    expect(buildFindingsMeta({} as AuditSummary).size).toBe(0);
  });

  it("keys page-scoped results by rule id and inferred template", () => {
    const meta = buildFindingsMeta(
      summaryOf({
        blockers: [
          { ruleId: "content/thin", pageUrl: "https://x.test/a/1/b", confidence: "high" },
        ],
      }),
    );
    // /a/1/b infers to /a/:num/b, so many pages collapse onto one finding row.
    expect(meta.get("content/thin::/a/:num/b")).toEqual({
      confidence: "high",
      carriedForward: undefined,
      lastVerifiedAt: undefined,
      effort: undefined,
    });
  });

  it("keys results with no pageUrl into the global bucket", () => {
    const meta = buildFindingsMeta(
      summaryOf({ informational: [{ ruleId: "tech/robots", effort: "quick" }] }),
    );
    expect(meta.has("tech/robots::__global__")).toBe(true);
    expect(meta.get("tech/robots::__global__")?.effort).toBe("quick");
  });

  it("reads every severity bucket, not just blockers", () => {
    const meta = buildFindingsMeta(
      summaryOf({
        blockers: [{ ruleId: "a" }],
        shouldFix: [{ ruleId: "b" }],
        informational: [{ ruleId: "c" }],
      }),
    );
    expect([...meta.keys()].sort()).toEqual(["a::__global__", "b::__global__", "c::__global__"]);
  });

  it("preserves carriedForward, the flag the recovered count depends on", () => {
    const meta = buildFindingsMeta(
      summaryOf({
        shouldFix: [
          { ruleId: "r1", pageUrl: "https://x.test/blog/post", carriedForward: true },
          { ruleId: "r2", pageUrl: "https://x.test/blog/post", carriedForward: false },
        ],
      }),
    );
    expect(meta.get("r1::/blog/post")?.carriedForward).toBe(true);
    expect(meta.get("r2::/blog/post")?.carriedForward).toBe(false);
  });

  it("collapses pages sharing a template onto one key", () => {
    const meta = buildFindingsMeta(
      summaryOf({
        blockers: [
          { ruleId: "r", pageUrl: "https://x.test/p/1", lastVerifiedAt: "2026-01-01" },
          { ruleId: "r", pageUrl: "https://x.test/p/2", lastVerifiedAt: "2026-02-02" },
        ],
      }),
    );
    expect(meta.size).toBe(1);
    // Last result wins, matching the original single-pass build.
    expect(meta.get("r::/p/:num")?.lastVerifiedAt).toBe("2026-02-02");
  });
});
