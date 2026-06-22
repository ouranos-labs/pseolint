import { describe, it, expect } from "vitest";
import { summaryTruncation } from "./truncation";

describe("summaryTruncation", () => {
  it("returns not-truncated for null / legacy v0.3 blobs", () => {
    expect(summaryTruncation(null)).toEqual({ truncated: false, reason: null, kind: null });
    expect(summaryTruncation({})).toEqual({ truncated: false, reason: null, kind: null });
  });

  it("reads a coverage-kind truncation with its reason", () => {
    const r = summaryTruncation({
      truncated: true,
      truncatedKind: "coverage",
      truncatedReason: "Fetched 12 of ~11019 sitemap-declared URLs",
    });
    expect(r).toEqual({
      truncated: true,
      kind: "coverage",
      reason: "Fetched 12 of ~11019 sitemap-declared URLs",
    });
  });

  it("reads a backpressure-kind truncation", () => {
    expect(summaryTruncation({ truncated: true, truncatedKind: "backpressure", truncatedReason: "origin 5xx" }))
      .toEqual({ truncated: true, kind: "backpressure", reason: "origin 5xx" });
  });

  it("collapses an unexpected/absent kind to null (untrusted JSON guard)", () => {
    expect(summaryTruncation({ truncated: true, truncatedKind: "weird" }).kind).toBeNull();
    expect(summaryTruncation({ truncated: true }).kind).toBeNull();
  });

  it("drops a blank/non-string reason and a kind on a non-truncated summary", () => {
    expect(summaryTruncation({ truncated: true, truncatedReason: "   " }).reason).toBeNull();
    // kind is read regardless of `truncated`, but `truncated:false` is the gate the UI checks.
    expect(summaryTruncation({ truncated: false, truncatedKind: "coverage" }).truncated).toBe(false);
  });
});
