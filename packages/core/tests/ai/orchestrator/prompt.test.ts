import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../../../src/ai/orchestrator/prompt.js";
import { DEFAULT_BUDGET } from "../../../src/ai/orchestrator/types.js";

describe("buildSystemPrompt", () => {
  it("includes the role and finish_audit contract", () => {
    const p = buildSystemPrompt(DEFAULT_BUDGET);
    expect(p).toContain("SEO audit orchestrator");
    expect(p).toContain("fix manifest");
    expect(p).toContain("finish_audit");
  });

  it("inlines the budget caps into the prompt body", () => {
    const p = buildSystemPrompt({
      maxToolCalls: 17,
      maxInputTokensTotal: 123_456,
      maxSessionUsd: 4.25,
      maxWallSeconds: 99,
    });
    expect(p).toContain("17 tool calls");
    expect(p).toContain("123,456");
    expect(p).toContain("$4.25");
    expect(p).toMatch(/99\s*s\s+wall/);
  });

  it("mentions confidence-aware tool use", () => {
    const p = buildSystemPrompt(DEFAULT_BUDGET);
    expect(p).toContain("confidence");
    expect(p).toMatch(/low|speculative/i);
  });

  it("recommends template-level over per-page patches when applicable", () => {
    const p = buildSystemPrompt(DEFAULT_BUDGET);
    expect(p).toContain("template-level");
  });

  it("omits the operator-focus section when no brief is given", () => {
    expect(buildSystemPrompt(DEFAULT_BUDGET)).not.toContain("Operator focus");
  });

  it("appends the brief as an operator-focus section, truncated and last", () => {
    const brief = "1. Near-duplicate cluster on /listing (spam/near-duplicate)";
    const p = buildSystemPrompt(DEFAULT_BUDGET, brief);
    expect(p).toContain("## Operator focus");
    expect(p).toContain(brief);
    // Appended after the stable prefix so caching holds: it's past the finish_audit line.
    expect(p.indexOf("## Operator focus")).toBeGreaterThan(p.indexOf("finish_audit"));
  });

  it("truncates an oversized brief to keep the prompt bounded", () => {
    const p = buildSystemPrompt(DEFAULT_BUDGET, "x".repeat(5000));
    expect(p).toContain("x".repeat(2000));
    expect(p).not.toContain("x".repeat(2001));
  });
});
