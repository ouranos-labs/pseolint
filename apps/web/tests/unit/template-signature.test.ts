import { describe, it, expect } from "vitest";
import { templateSignatureFor } from "@/lib/findings-state";
import type { RuleResult } from "@pseolint/core";

const mk = (p: Partial<RuleResult>): RuleResult => ({
  ruleId: "spam/thin-content",
  severity: "warning",
  message: "",
  ...p,
});

describe("templateSignatureFor", () => {
  it("returns inferred URL template when pageUrl is present", () => {
    expect(templateSignatureFor(mk({ pageUrl: "https://ex.com/state/123/city/456" })))
      .toMatch(/:[a-z]+/);
  });

  it("returns __global__ when no pageUrl", () => {
    expect(templateSignatureFor(mk({ pageUrl: undefined }))).toBe("__global__");
  });

  it("stable across two URLs in the same template", () => {
    const a = templateSignatureFor(mk({ pageUrl: "https://ex.com/state/123/city/456" }));
    const b = templateSignatureFor(mk({ pageUrl: "https://ex.com/state/789/city/999" }));
    expect(a).toBe(b);
  });
});
