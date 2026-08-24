import { estimateCostUsd } from "../cost.js";
import type { BudgetCaps, StopReason, UsageSnapshot } from "./types.js";

/**
 * Tracks per-session usage against `BudgetCaps`. Consumed by the runner's
 * step boundary: after every LLM step + tool batch, we record the usage and
 * ask `nextStopReason()` whether to terminate.
 *
 * Wall time is measured from `start()`. Cost is estimated using the existing
 * `estimateCostUsd` table; for unknown providers/models, cost defaults to 0
 * which means USD caps don't fire: caller is responsible for ensuring
 * provider/model are recognized when USD enforcement matters.
 */
export class BudgetTracker {
  private inputTokens = 0;
  private outputTokens = 0;
  private toolCallCount = 0;
  private externalUsd = 0;
  private startedAt = 0;
  /** Largest observed input-token count for any single step. Drives the projection. */
  private maxStepInputTokens = 0;
  private maxStepOutputTokens = 0;
  private stepCount = 0;

  constructor(
    private readonly caps: BudgetCaps,
    private readonly providerId: string,
    private readonly modelId: string,
  ) {}

  start(): void {
    this.startedAt = Date.now();
  }

  recordStepUsage(usage: { inputTokens?: number; outputTokens?: number }): number {
    const input = usage.inputTokens ?? 0;
    const output = usage.outputTokens ?? 0;
    this.inputTokens += input;
    this.outputTokens += output;
    if (input > this.maxStepInputTokens) this.maxStepInputTokens = input;
    if (output > this.maxStepOutputTokens) this.maxStepOutputTokens = output;
    this.stepCount += 1;
    return this.estimatedUsd();
  }

  recordToolCalls(n: number): void {
    this.toolCallCount += n;
  }

  /**
   * Record a non-LLM external API cost (SerpAPI calls, AI-engine probes,
   * etc.) so the session budget accurately reflects total spend, not just
   * orchestrator-LLM tokens.
   */
  recordExternalCost(usd: number): void {
    if (usd > 0) this.externalUsd += usd;
  }

  estimatedUsd(): number {
    const llmUsd =
      estimateCostUsd(this.providerId, this.modelId, {
        input: this.inputTokens,
        output: this.outputTokens,
      }) ?? 0;
    return llmUsd + this.externalUsd;
  }

  snapshot(): UsageSnapshot {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      estimatedUsd: this.estimatedUsd(),
      toolCallCount: this.toolCallCount,
      elapsedMs: this.startedAt === 0 ? 0 : Date.now() - this.startedAt,
    };
  }

  /**
   * Returns the StopReason that fires now, or null when no cap is breached.
   * Order matters: earlier checks take priority when multiple caps exceed
   * simultaneously (most informative reason wins).
   */
  nextStopReason(): StopReason | null {
    if (this.toolCallCount >= this.caps.maxToolCalls) return "tool_call_limit";
    if (this.inputTokens >= this.caps.maxInputTokensTotal) return "input_token_limit";
    if (this.estimatedUsd() >= this.caps.maxSessionUsd) return "usd_limit";
    if (this.startedAt > 0 && Date.now() - this.startedAt >= this.caps.maxWallSeconds * 1000) {
      return "wall_time_limit";
    }
    return null;
  }

  /**
   * Pre-flight projection: would executing one more step at the worst-case
   * (max observed) per-step cost push us over the USD or input-token cap?
   * Used by `stopWhen` to refuse the next step before it overshoots, rather
   * than reactively after.
   *
   * Returns null until at least one step has completed: we have nothing
   * to project from before that.
   */
  projectedNextStopReason(): StopReason | null {
    if (this.stepCount === 0) return null;

    const projectedInput = this.inputTokens + this.maxStepInputTokens;
    if (projectedInput >= this.caps.maxInputTokensTotal) return "input_token_limit";

    const projectedLlmUsd =
      estimateCostUsd(this.providerId, this.modelId, {
        input: projectedInput,
        output: this.outputTokens + this.maxStepOutputTokens,
      }) ?? 0;
    if (projectedLlmUsd + this.externalUsd >= this.caps.maxSessionUsd) return "usd_limit";

    return null;
  }
}
