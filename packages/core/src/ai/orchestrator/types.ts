import type { OrchestratorToolName } from "../tools/index.js";
import type { FixManifest } from "./finish-tool.js";

/**
 * Hard caps on a single orchestrator session. Pre-flight checks against these
 * happen on every step boundary; exceeding any cap aborts the session and
 * returns the partial manifest accumulated so far.
 */
export interface BudgetCaps {
  /** Max number of tool calls before forced termination. Default 100. */
  maxToolCalls: number;
  /** Max cumulative input tokens across all LLM calls. Default 500_000. */
  maxInputTokensTotal: number;
  /** Max estimated USD spend for this session. Default $5. */
  maxSessionUsd: number;
  /** Max wall-clock seconds before forced termination. Default 300 (5 min). */
  maxWallSeconds: number;
  /**
   * Inject a watchdog system message every N tool calls reminding the model
   * to converge on a manifest. Defaults to 20: i.e. on calls 20, 40, 60,
   * 80, the model gets a "are you converging?" nudge. Set to 0 to disable.
   */
  watchdogIntervalCalls: number;
}

export const DEFAULT_BUDGET: BudgetCaps = {
  maxToolCalls: 100,
  maxInputTokensTotal: 500_000,
  maxSessionUsd: 5,
  maxWallSeconds: 300,
  watchdogIntervalCalls: 20,
};

/** Cumulative usage so far in a session. */
export interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
  toolCallCount: number;
  elapsedMs: number;
}

/** Reason a session terminated, present on every SessionResult. */
export type StopReason =
  | "completed"           // finish_audit was called
  | "tool_call_limit"
  | "input_token_limit"
  | "usd_limit"
  | "wall_time_limit"
  | "model_error"
  | "aborted"             // external signal aborted
  | "no_finish_called";   // model returned without calling finish_audit

/**
 * Discriminated event union streamed during a session. Consumers (web app's
 * SSE channel, R2 log writer, vitest assertions) subscribe via the
 * orchestrator's `onEvent` callback. The same events end up in the durable
 * NDJSON log so the session can be replayed offline.
 */
export type SessionEvent =
  | { kind: "session_started"; sessionId: string; domain: string; startedAt: string }
  | { kind: "tool_call"; toolName: OrchestratorToolName | "finish_audit"; input: unknown }
  | { kind: "tool_result"; toolName: OrchestratorToolName | "finish_audit"; result: unknown }
  | { kind: "thought"; text: string }
  /**
   * Per-step delta. inputTokens/outputTokens are this step alone (not
   * cumulative); estimatedUsd is the per-step cost (sum these to get total).
   * `durationMs` is wall-clock time from the start of this step to when
   * its onStepFinish fired: undefined when prepareStep didn't run for the
   * very first step. Cumulative state lives in `session_finished.usage`.
   */
  | { kind: "step_usage"; inputTokens: number; outputTokens: number; estimatedUsd: number; durationMs?: number }
  | { kind: "watchdog_injected"; toolCallCount: number }
  | { kind: "budget_warning"; reason: string; usage: UsageSnapshot }
  | { kind: "session_finished"; reason: StopReason; usage: UsageSnapshot };

/**
 * Final result returned by `runOrchestrator`. `manifest` is whatever
 * `finish_audit` was called with: null when the session terminated for any
 * reason other than the model calling finish_audit.
 */
export interface SessionResult {
  sessionId: string;
  domain: string;
  reason: StopReason;
  manifest: FixManifest | null;
  usage: UsageSnapshot;
  /** Full event log from the session, in order. */
  events: SessionEvent[];
  /** Error message when reason indicates failure. */
  error?: string;
}
