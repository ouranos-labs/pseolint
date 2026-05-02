import { generateText, type LanguageModel } from "ai";
import { estimateCostUsd } from "../cost.js";
import { orchestratorTools } from "../tools/index.js";
import { finishAuditTool, manifestSchema, type FixManifest } from "./finish-tool.js";
import { PageCache, withPageCache } from "./page-cache.js";
import { buildSystemPrompt } from "./prompt.js";
import { SessionState } from "./session.js";
import type { BudgetCaps, SessionResult, StopReason } from "./types.js";
import type { EventSink as _EventSinkPathReexport } from "./log.js";

/**
 * Loose type for the tool registry. The AI SDK's `Tool<I, O>` is invariant
 * in its generics, so a heterogeneous map of tools with distinct schemas
 * can't be statically typed as `Record<string, Tool<unknown, unknown>>`.
 * We accept the unsoundness at this single boundary — every individual tool
 * is type-safe at definition site (via `defineTool`), and the AI SDK
 * validates inputs at runtime via Zod regardless.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDefinedTool = { name: string; toAiTool: () => any };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAiTool = any;

export interface RunOrchestratorOptions {
  domain: string;
  userId: string;
  model: LanguageModel;
  /** Provider id for cost estimation (e.g. "anthropic"). */
  providerId: string;
  /** Model id for cost estimation (e.g. "claude-opus-4-7"). */
  modelId: string;
  /** Override default budget caps. Defaults from DEFAULT_BUDGET. */
  budget?: Partial<BudgetCaps>;
  /** Optional path for durable NDJSON session log. */
  ndjsonPath?: string;
  /** Optional event sink (e.g. SSE / R2 fanout). */
  onEvent?: EventSink;
  /** External abort signal — aborting flips the session to `aborted`. */
  signal?: AbortSignal;
  /**
   * Override the tool registry. Default = full `orchestratorTools` plus
   * `finish_audit`. Tests pass a smaller subset; production passes the full
   * registry.
   */
  tools?: Record<string, AnyDefinedTool>;
  /**
   * Per-model-call retry budget for transient errors (5xx, rate limits,
   * network failures). The AI SDK handles the retry loop internally and
   * respects `retry-after` headers from the provider, so each retry waits
   * the rate-limit window when the provider asks.
   *
   * Default 5: tier-1 Anthropic accounts have a 30K input-tokens-per-minute
   * cap that burst-friendly orchestrator sessions can hit. Five retries
   * with exponential backoff (~1s/2s/4s/8s/16s base) span a full 60s TPM
   * refresh, so the next retry usually succeeds. Lower this only if the
   * caller has tier-2+ keys (no TPM cap) or cares more about fail-fast.
   */
  maxRetries?: number;
}

const FINISH_TOOL_NAME = "finish_audit";

/**
 * Run a single orchestrator session end-to-end. Returns the final
 * `SessionResult` once the LLM calls `finish_audit`, the budget is
 * exhausted, the abort signal fires, or the model errors out.
 *
 * No streaming yet — uses `generateText` for simpler test ergonomics with
 * the existing `MockModel` (which only implements `doGenerate`). Phase 2
 * follow-up swaps to `streamText` once we have a stream-capable mock and a
 * web-app SSE endpoint to wire up.
 */
export async function runOrchestrator(opts: RunOrchestratorOptions): Promise<SessionResult> {
  const session = new SessionState({
    domain: opts.domain,
    userId: opts.userId,
    providerId: opts.providerId,
    modelId: opts.modelId,
    budget: opts.budget,
    ndjsonPath: opts.ndjsonPath,
    onEvent: opts.onEvent,
  });

  await session.start();

  const baseTools: Record<string, AnyDefinedTool> =
    opts.tools ?? (orchestratorTools as unknown as Record<string, AnyDefinedTool>);
  const aiTools: Record<string, AnyAiTool> = {};
  for (const [name, tool] of Object.entries(baseTools)) {
    aiTools[name] = tool.toAiTool();
  }
  // The runner detects finish_audit by name and pulls the manifest from
  // its tool-call input — the AI SDK ferries the rest through normally.
  aiTools[FINISH_TOOL_NAME] = finishAuditTool.toAiTool();

  const systemPrompt = buildSystemPrompt(session.caps);

  let stopReason: StopReason = "no_finish_called";
  let modelError: string | undefined;
  // Closure for per-step timing. prepareStep records start; onStepFinish
  // reads + emits duration. generateText is sequential so the
  // single-cell pattern is race-free.
  let currentStepStartedAt = 0;
  // Last tool-call count at which we injected a watchdog message. Used to
  // suppress duplicate firings within the same multiple-of-N window when
  // the orchestrator emits multiple tool calls per step.
  let lastWatchdogAtToolCount = 0;

  // Per-session page cache. `fetch_page` writes HTML here keyed by pageId;
  // page-content-consuming tools read by pageId. AsyncLocalStorage threads
  // it through the AI SDK's tool loop without expanding the tool API.
  const pageCache = new PageCache();

  try {
    await withPageCache(pageCache, () => generateText({
      model: opts.model,
      system: systemPrompt,
      tools: aiTools,
      messages: [
        {
          role: "user",
          content: `Audit ${opts.domain}. Produce a fix manifest covering integrity, discoverability, citation, and data per the methodology in the system prompt. Call finish_audit when done.`,
        },
      ],
      stopWhen: ({ steps }) => {
        if (session.isFinished()) return true;
        if (opts.signal?.aborted) return true;
        if (session.budget.nextStopReason() !== null) return true;
        // Pre-flight: refuse the next step if it would breach the USD or
        // input-token cap based on the max-observed per-step cost so far.
        // Reactive enforcement (nextStopReason) above catches breaches *after*
        // they happen; this catches them *before*. Both fences exist because
        // pre-flight is conservative (uses max-observed, not avg) and may
        // miss anomalous future steps the average wouldn't predict.
        if (session.budget.projectedNextStopReason() !== null) return true;
        // Hard fallback against runaway loops; budget caps are the real guard.
        return steps.length >= session.caps.maxToolCalls + 5;
      },
      prepareStep: async ({ messages }) => {
        currentStepStartedAt = Date.now();

        const interval = session.caps.watchdogIntervalCalls;
        const toolCount = session.budget.snapshot().toolCallCount;
        // Fire watchdog when we've crossed a multiple-of-interval boundary
        // since the last firing. `lastWatchdogAtToolCount` rises monotonically
        // so we never re-inject for the same window.
        const lastBoundary = Math.floor(lastWatchdogAtToolCount / interval);
        const currentBoundary = Math.floor(toolCount / interval);
        if (interval > 0 && toolCount > 0 && currentBoundary > lastBoundary) {
          lastWatchdogAtToolCount = toolCount;
          await session.emit({ kind: "watchdog_injected", toolCallCount: toolCount });
          // Inject as a `user` role message, not `system`. Anthropic's API
          // rejects multiple system messages interspersed with user/assistant
          // turns ("Multiple system messages that are separated by user/
          // assistant messages functionality not supported"), and other
          // providers vary in tolerance. A user-role nudge is universally
          // accepted and reads natural ("hey, are you converging?").
          return {
            messages: [
              ...messages,
              {
                role: "user",
                content:
                  `[watchdog] You've made ${toolCount} tool calls. ` +
                  `Hard cap is ${session.caps.maxToolCalls}. ` +
                  `Are you converging on a manifest? If not, summarize remaining gaps now and call finish_audit. ` +
                  `Partial manifests are still useful — prefer breadth over depth.`,
              },
            ],
          };
        }
        return undefined;
      },
      onStepFinish: async ({ toolCalls, toolResults, text, usage }) => {
        const stepDurationMs = currentStepStartedAt > 0 ? Date.now() - currentStepStartedAt : undefined;
        if (text) {
          await session.emit({ kind: "thought", text });
        }

        for (const c of toolCalls) {
          await session.emit({
            kind: "tool_call",
            toolName: c.toolName as never,
            input: c.input,
          });
        }

        for (const r of toolResults) {
          await session.emit({
            kind: "tool_result",
            toolName: r.toolName as never,
            result: r.output,
          });

          // External-probe cost ingestion. Tools that hit billable APIs
          // (query_serp, ask_ai_engine) include `apiCostUsd` in their data
          // payload. The orchestrator's USD cap would otherwise be fiction
          // for sessions that lean on probes — this is the only place where
          // non-LLM costs get folded into the session budget.
          const probeCost = extractProbeCost(r.output);
          if (probeCost > 0) session.budget.recordExternalCost(probeCost);

          if (r.toolName === FINISH_TOOL_NAME) {
            const call = toolCalls.find((c) => c.toolCallId === r.toolCallId);
            // The AI SDK validates input via the tool's Zod schema before
            // dispatching to execute(), so by the time the result fires the
            // manifest shape is already known-good. Re-validating here gives
            // us the typed shape and a defensive guard against weird SDK
            // edge cases (missing call, unexpected input shape) without
            // assuming the cast.
            const parsed = call ? manifestSchema.safeParse((call.input as { manifest?: unknown })?.manifest) : null;
            session.markFinished(parsed?.success ? (parsed.data as FixManifest) : null);
          }
        }

        session.budget.recordToolCalls(toolCalls.length);
        const stepInputTokens = usage.inputTokens ?? 0;
        const stepOutputTokens = usage.outputTokens ?? 0;
        session.budget.recordStepUsage({
          inputTokens: stepInputTokens,
          outputTokens: stepOutputTokens,
        });

        await session.emit({
          kind: "step_usage",
          inputTokens: stepInputTokens,
          outputTokens: stepOutputTokens,
          estimatedUsd:
            estimateCostUsd(opts.providerId, opts.modelId, {
              input: stepInputTokens,
              output: stepOutputTokens,
            }) ?? 0,
          durationMs: stepDurationMs,
        });

        const breach = session.budget.nextStopReason();
        if (breach !== null) {
          stopReason = breach;
          await session.emit({
            kind: "budget_warning",
            reason: breach,
            usage: session.budget.snapshot(),
          });
        }
      },
      abortSignal: opts.signal,
      maxRetries: opts.maxRetries ?? 5,
    }));
  } catch (e) {
    modelError = e instanceof Error ? e.message : String(e);
    stopReason = opts.signal?.aborted ? "aborted" : "model_error";
  }

  if (session.isFinished()) {
    stopReason = "completed";
  } else if (stopReason === "no_finish_called" && opts.signal?.aborted) {
    stopReason = "aborted";
  }

  const usage = session.budget.snapshot();
  await session.emit({ kind: "session_finished", reason: stopReason, usage });

  return {
    sessionId: session.id,
    domain: session.domain,
    reason: stopReason,
    manifest: session.getManifest(),
    usage,
    events: session.events(),
    error: modelError,
  };
}

/**
 * Best-effort extraction of `apiCostUsd` from a tool result. Tool outputs
 * are wrapped as `{ ok: true, data }` or `{ ok: false, error }` by
 * `defineTool`. We only bill for ok results carrying a non-negative
 * numeric `apiCostUsd` field — every other shape returns 0.
 */
function extractProbeCost(output: unknown): number {
  if (output === null || typeof output !== "object") return 0;
  const o = output as { ok?: unknown; data?: unknown };
  if (o.ok !== true || o.data === null || typeof o.data !== "object") return 0;
  const usd = (o.data as { apiCostUsd?: unknown }).apiCostUsd;
  if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) return 0;
  return usd;
}

// Type re-export to keep `EventSink` reachable from this module without
// requiring callers to import from log.ts directly.
export type EventSink = _EventSinkPathReexport;
