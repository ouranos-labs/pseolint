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
    expect(p).toContain("99 seconds");
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
});
