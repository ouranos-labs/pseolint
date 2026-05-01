import { tool } from "ai";
import type { ZodType } from "zod";

/**
 * Tool execution context. The AI SDK passes this as the second argument to
 * `execute` — we surface only the fields tools care about (currently just
 * the abort signal). Tools that don't need it can ignore the context.
 */
export interface ToolExecuteContext {
  /**
   * Aborted when the orchestrator session aborts. Tools that perform I/O
   * (fetch_page, query_serp, ask_ai_engine, etc.) should thread this into
   * their underlying fetch calls so in-flight network work cancels
   * promptly when the session ends.
   */
  signal?: AbortSignal;
}

/**
 * Tool definition consumed by `defineTool`. Each orchestrator tool exposes a
 * Zod-typed input + output schema, a description (used by the LLM to decide
 * when to call the tool), and an `execute` function.
 *
 * The `name` field doubles as the registry key — `orchestratorTools[name]`
 * resolves to the AI-SDK tool object generated from this definition.
 */
export interface ToolDefinition<I, O> {
  name: string;
  description: string;
  inputSchema: ZodType<I>;
  outputSchema: ZodType<O>;
  execute: (input: I, ctx?: ToolExecuteContext) => Promise<O>;
}

/** Successful tool result wrapped in a discriminated union for LLM consumption. */
export interface ToolOk<O> {
  ok: true;
  data: O;
}

/**
 * Tool error result. Errors are returned as data, not thrown — the orchestrator
 * loop must keep going. Throwing here would terminate the AI-SDK stream and
 * lose partial session progress.
 */
export interface ToolErr {
  ok: false;
  error: string;
  errorCode: "INPUT_VALIDATION" | "OUTPUT_VALIDATION" | "EXECUTE_ERROR";
}

export type ToolResult<O> = ToolOk<O> | ToolErr;

/**
 * Wraps a tool definition in:
 *   - input validation (delegated to AI SDK + duplicated in `.run` for tests)
 *   - output validation (catches tool bugs that produce malformed outputs)
 *   - error capture (turns thrown exceptions into `{ ok: false, error }` payloads)
 *
 * Returns an object exposing both `.toAiTool()` (for the orchestrator) and
 * `.run()` (for direct test invocation). The AI SDK tool() and our test runner
 * share the same error shape so tests assert exactly what the LLM will see.
 */
export function defineTool<I, O>(def: ToolDefinition<I, O>) {
  async function executeWithCapture(input: I, ctx?: ToolExecuteContext): Promise<ToolResult<O>> {
    let output: O;
    try {
      output = await def.execute(input, ctx);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `tool ${def.name} threw: ${message}`, errorCode: "EXECUTE_ERROR" };
    }
    const parsed = def.outputSchema.safeParse(output);
    if (!parsed.success) {
      return {
        ok: false,
        error: `tool ${def.name} produced invalid output: ${parsed.error.message}`,
        errorCode: "OUTPUT_VALIDATION",
      };
    }
    return { ok: true, data: parsed.data };
  }

  return {
    name: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    outputSchema: def.outputSchema,
    /**
     * AI SDK tool object — pass into `streamText({ tools: { name: t.toAiTool() } })`.
     * The SDK invokes `execute(input, { abortSignal, toolCallId, ... })`; we
     * lift `abortSignal` into our `ToolExecuteContext.signal` so I/O tools
     * can cancel in-flight fetches when the session aborts.
     */
    toAiTool() {
      return tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (input: I, options?: { abortSignal?: AbortSignal }) =>
          executeWithCapture(input, { signal: options?.abortSignal }),
      });
    },
    /** Direct invocation for unit tests. Validates input + output. Optional `ctx` for signal-aware tests. */
    async run(input: I, ctx?: ToolExecuteContext): Promise<ToolResult<O>> {
      const inputParsed = def.inputSchema.safeParse(input);
      if (!inputParsed.success) {
        return {
          ok: false,
          error: `tool ${def.name} got invalid input: ${inputParsed.error.message}`,
          errorCode: "INPUT_VALIDATION",
        };
      }
      return executeWithCapture(inputParsed.data, ctx);
    },
  };
}

export type DefinedTool<I, O> = ReturnType<typeof defineTool<I, O>>;
