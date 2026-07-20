import { describe, it, expect } from "vitest";
import { estimateCostUsd } from "../../src/ai/cost.js";

describe("estimateCostUsd", () => {
  it("computes Sonnet pricing", () => {
    // 1M input @ $3 + 1M output @ $15 = $18
    const cost = estimateCostUsd("anthropic", "claude-sonnet-4-6", { input: 1_000_000, output: 1_000_000 });
    expect(cost).toBeCloseTo(18, 2);
  });

  it("computes Haiku pricing", () => {
    const cost = estimateCostUsd("anthropic", "claude-haiku-4-5-20251001", { input: 1_000_000, output: 0 });
    expect(cost).toBeCloseTo(1.0, 2);
  });

  it("computes Opus pricing", () => {
    // 1M input @ $5 + 1M output @ $25 = $30
    const cost = estimateCostUsd("anthropic", "claude-opus-4-8", { input: 1_000_000, output: 1_000_000 });
    expect(cost).toBeCloseTo(30, 2);
  });

  it("returns undefined for unknown model", () => {
    expect(estimateCostUsd("anthropic", "gpt-9000", { input: 100, output: 100 })).toBeUndefined();
  });

  it("returns undefined for ollama (local)", () => {
    expect(estimateCostUsd("ollama", "llama3.1:8b", { input: 1_000_000, output: 1_000_000 })).toBeUndefined();
  });

  it("scales linearly", () => {
    const a = estimateCostUsd("anthropic", "claude-sonnet-4-6", { input: 50_000, output: 1_000 });
    const b = estimateCostUsd("anthropic", "claude-sonnet-4-6", { input: 100_000, output: 2_000 });
    expect(b).toBeCloseTo((a ?? 0) * 2, 6);
  });
});
