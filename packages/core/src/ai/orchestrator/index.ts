/**
 * Orchestrator MVP entry points.
 *
 * The runner takes a domain + a resolved `LanguageModel` (use existing
 * `createLanguageModel` from ai/adapters) and runs a single audit session
 * to completion or until budget is exhausted. Events are emitted to an
 * optional `onEvent` callback (SSE / R2 fanout in the web app) and an
 * optional NDJSON file. The full event log is also returned in the result.
 *
 * Phase 2 MVP scope: single-agent, generateText (not streamText), no
 * watchdog injection. The follow-up swaps in streamText for live UI
 * streaming and adds the watchdog.
 */
export { runOrchestrator } from "./runner.js";
export type { RunOrchestratorOptions, EventSink } from "./runner.js";
export { SessionState } from "./session.js";
export type { SessionStateOptions } from "./session.js";
export { BudgetTracker } from "./budget.js";
export { SessionLog } from "./log.js";
export { buildSystemPrompt } from "./prompt.js";
export { finishAuditTool, manifestSchema } from "./finish-tool.js";
export type { FixManifest } from "./finish-tool.js";
export {
  DEFAULT_BUDGET,
} from "./types.js";
export type {
  BudgetCaps,
  UsageSnapshot,
  StopReason,
  SessionEvent,
  SessionResult,
} from "./types.js";
