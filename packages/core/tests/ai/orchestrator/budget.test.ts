import { describe, it, expect } from "vitest";
import { BudgetTracker } from "../../../src/ai/orchestrator/budget.js";
import { DEFAULT_BUDGET } from "../../../src/ai/orchestrator/types.js";

describe("BudgetTracker", () => {
  it("snapshot starts at zero", () => {
    const t = new BudgetTracker(DEFAULT_BUDGET, "anthropic", "claude-sonnet-4-6");
    const snap = t.snapshot();
    expect(snap.inputTokens).toBe(0);
    expect(snap.outputTokens).toBe(0);
    expect(snap.toolCallCount).toBe(0);
    expect(snap.elapsedMs).toBe(0);
  });

  it("accumulates token usage", () => {
    const t = new BudgetTracker(DEFAULT_BUDGET, "anthropic", "claude-sonnet-4-6");
    t.recordStepUsage({ inputTokens: 1000, outputTokens: 500 });
    t.recordStepUsage({ inputTokens: 500, outputTokens: 200 });
    const snap = t.snapshot();
    expect(snap.inputTokens).toBe(1500);
    expect(snap.outputTokens).toBe(700);
  });

  it("counts tool calls cumulatively", () => {
    const t = new BudgetTracker(DEFAULT_BUDGET, "anthropic", "claude-sonnet-4-6");
    t.recordToolCalls(3);
    t.recordToolCalls(2);
    expect(t.snapshot().toolCallCount).toBe(5);
  });

  it("returns null when no caps are breached", () => {
    const t = new BudgetTracker(DEFAULT_BUDGET, "anthropic", "claude-sonnet-4-6");
    t.recordToolCalls(5);
    expect(t.nextStopReason()).toBeNull();
  });

  it("returns tool_call_limit when toolCallCount >= cap", () => {
    const t = new BudgetTracker({ ...DEFAULT_BUDGET, maxToolCalls: 3 }, "anthropic", "claude-sonnet-4-6");
    t.recordToolCalls(3);
    expect(t.nextStopReason()).toBe("tool_call_limit");
  });

  it("returns input_token_limit when inputTokens >= cap", () => {
    const t = new BudgetTracker(
      { ...DEFAULT_BUDGET, maxInputTokensTotal: 1000 },
      "anthropic",
      "claude-sonnet-4-6",
    );
    t.recordStepUsage({ inputTokens: 1000, outputTokens: 0 });
    expect(t.nextStopReason()).toBe("input_token_limit");
  });

  it("returns wall_time_limit after maxWallSeconds elapses", async () => {
    const t = new BudgetTracker(
      { ...DEFAULT_BUDGET, maxWallSeconds: 0.001 }, // 1ms cap to trigger fast
      "anthropic",
      "claude-sonnet-4-6",
    );
    t.start();
    await new Promise((r) => setTimeout(r, 20));
    expect(t.nextStopReason()).toBe("wall_time_limit");
  });

  it("returns 0 USD estimate for unknown provider/model (cost table miss)", () => {
    const t = new BudgetTracker(DEFAULT_BUDGET, "unknown-provider", "unknown-model");
    t.recordStepUsage({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(t.estimatedUsd()).toBe(0);
  });

  it("priority order: tool_call_limit beats input_token_limit when both exceed", () => {
    const t = new BudgetTracker(
      { ...DEFAULT_BUDGET, maxToolCalls: 2, maxInputTokensTotal: 100 },
      "anthropic",
      "claude-sonnet-4-6",
    );
    t.recordToolCalls(5);
    t.recordStepUsage({ inputTokens: 200, outputTokens: 0 });
    expect(t.nextStopReason()).toBe("tool_call_limit");
  });

  it("folds external probe costs into estimatedUsd", () => {
    const t = new BudgetTracker(DEFAULT_BUDGET, "anthropic", "claude-sonnet-4-6");
    t.recordExternalCost(0.005);
    t.recordExternalCost(0.003);
    expect(t.estimatedUsd()).toBeCloseTo(0.008, 6);
  });

  it("ignores non-positive external costs", () => {
    const t = new BudgetTracker(DEFAULT_BUDGET, "anthropic", "claude-sonnet-4-6");
    t.recordExternalCost(-1);
    t.recordExternalCost(0);
    expect(t.estimatedUsd()).toBe(0);
  });

  it("USD cap fires when LLM + external combined cross the cap", () => {
    const t = new BudgetTracker(
      { ...DEFAULT_BUDGET, maxSessionUsd: 0.01 },
      "anthropic",
      "claude-sonnet-4-6",
    );
    // LLM cost stays 0 here (no tokens), external alone trips the cap.
    t.recordExternalCost(0.012);
    expect(t.nextStopReason()).toBe("usd_limit");
  });

  it("projectedNextStopReason returns null before any steps run", () => {
    const t = new BudgetTracker(DEFAULT_BUDGET, "anthropic", "claude-sonnet-4-6");
    expect(t.projectedNextStopReason()).toBeNull();
  });

  it("projectedNextStopReason fires input_token_limit when next step would overshoot", () => {
    const t = new BudgetTracker(
      { ...DEFAULT_BUDGET, maxInputTokensTotal: 1500 },
      "anthropic",
      "claude-sonnet-4-6",
    );
    // One step at 800 input tokens. Cumulative=800, max=800. Next-step
    // projection = 800+800 = 1600 ≥ 1500.
    t.recordStepUsage({ inputTokens: 800, outputTokens: 100 });
    expect(t.nextStopReason()).toBeNull();
    expect(t.projectedNextStopReason()).toBe("input_token_limit");
  });

  it("projectedNextStopReason returns null when there's headroom for one more step", () => {
    const t = new BudgetTracker(
      { ...DEFAULT_BUDGET, maxInputTokensTotal: 10_000 },
      "anthropic",
      "claude-sonnet-4-6",
    );
    t.recordStepUsage({ inputTokens: 800, outputTokens: 100 });
    expect(t.projectedNextStopReason()).toBeNull();
  });
});
