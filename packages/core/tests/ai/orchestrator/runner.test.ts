import { describe, it, expect } from "vitest";
import { z } from "zod";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Usage,
  LanguageModelV2CallWarning,
} from "@ai-sdk/provider";
import { runOrchestrator } from "../../../src/ai/orchestrator/runner.js";
import { finishAuditTool } from "../../../src/ai/orchestrator/finish-tool.js";
import { defineTool } from "../../../src/ai/tools/types.js";

type DoGenerateResult = {
  content: Array<LanguageModelV2Content>;
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelV2Usage;
  warnings: Array<LanguageModelV2CallWarning>;
};

/**
 * Minimal multi-step mock model: returns each pre-canned response in order,
 * one per `doGenerate` call. AI SDK v5 calls `doGenerate` once per step in
 * `generateText`, so a 2-element array drives a 2-step tool loop.
 */
class SequenceMockModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "anthropic";
  readonly modelId = "claude-sonnet-4-6";
  readonly supportedUrls = {};
  callCount = 0;

  constructor(private readonly responses: DoGenerateResult[]) {}

  async doGenerate(_opts: LanguageModelV2CallOptions): Promise<DoGenerateResult> {
    const i = this.callCount;
    this.callCount += 1;
    const r = this.responses[i];
    if (!r) {
      throw new Error(`SequenceMockModel: no response for call ${i}`);
    }
    return r;
  }

  doStream(): never {
    throw new Error("SequenceMockModel.doStream is not implemented");
  }
}

const validManifest = {
  domain: "example.com",
  verdict: "ready" as const,
  categories: { integrity: "A", discoverability: "B", citation: "A", data: "A" },
  templates: [],
  pages: [],
  domainLevel: [],
};

const usage = (input = 100, output = 50) => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
});

describe("runOrchestrator", () => {
  it("completes when the model calls finish_audit", async () => {
    const model = new SequenceMockModel([
      {
        finishReason: "tool-calls",
        usage: usage(),
        warnings: [],
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-1",
            toolName: "finish_audit",
            input: JSON.stringify({ manifest: validManifest }),
          },
        ],
      },
    ]);

    const result = await runOrchestrator({
      domain: "example.com",
      userId: "u-1",
      model,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      // Run with empty tool registry: only finish_audit is needed for this happy-path test.
      tools: {},
    });

    expect(result.reason).toBe("completed");
    expect(result.manifest).toEqual(validManifest);
    expect(result.usage.toolCallCount).toBe(1);
    expect(result.usage.inputTokens).toBe(100);
    expect(result.events.some((e) => e.kind === "session_started")).toBe(true);
    expect(result.events.some((e) => e.kind === "session_finished")).toBe(true);
  });

  it("captures session events in order", async () => {
    const model = new SequenceMockModel([
      {
        finishReason: "tool-calls",
        usage: usage(),
        warnings: [],
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-1",
            toolName: "finish_audit",
            input: JSON.stringify({ manifest: validManifest }),
          },
        ],
      },
    ]);

    const result = await runOrchestrator({
      domain: "example.com",
      userId: "u-1",
      model,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      tools: {},
    });

    const kinds = result.events.map((e) => e.kind);
    // session_started first, session_finished last, with at least one tool_call between.
    expect(kinds[0]).toBe("session_started");
    expect(kinds[kinds.length - 1]).toBe("session_finished");
    expect(kinds).toContain("tool_call");
    expect(kinds).toContain("tool_result");
  });

  it("emits step_usage events with cumulative token tracking", async () => {
    const model = new SequenceMockModel([
      {
        finishReason: "tool-calls",
        usage: usage(1234, 567),
        warnings: [],
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-1",
            toolName: "finish_audit",
            input: JSON.stringify({ manifest: validManifest }),
          },
        ],
      },
    ]);

    const result = await runOrchestrator({
      domain: "example.com",
      userId: "u-1",
      model,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      tools: {},
    });

    expect(result.usage.inputTokens).toBe(1234);
    expect(result.usage.outputTokens).toBe(567);
    const usageEvent = result.events.find((e) => e.kind === "step_usage");
    expect(usageEvent).toBeDefined();
    if (usageEvent && usageEvent.kind === "step_usage") {
      expect(usageEvent.inputTokens).toBe(1234);
    }
  });

  it("forwards events to onEvent callback in real time", async () => {
    const seen: string[] = [];
    const model = new SequenceMockModel([
      {
        finishReason: "tool-calls",
        usage: usage(),
        warnings: [],
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-1",
            toolName: "finish_audit",
            input: JSON.stringify({ manifest: validManifest }),
          },
        ],
      },
    ]);

    await runOrchestrator({
      domain: "example.com",
      userId: "u-1",
      model,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      tools: {},
      onEvent: (e) => {
        seen.push(e.kind);
      },
    });

    expect(seen[0]).toBe("session_started");
    expect(seen).toContain("tool_call");
    expect(seen).toContain("tool_result");
    expect(seen[seen.length - 1]).toBe("session_finished");
  });

  it("includes finish_audit in the orchestrator tool registry by default", () => {
    // Sanity: no execution; ensures the finish tool's name + description are stable.
    expect(finishAuditTool.name).toBe("finish_audit");
    expect(finishAuditTool.description).toContain("Terminate");
  });

  it("emits step_usage events with a numeric durationMs", async () => {
    const model = new SequenceMockModel([
      {
        finishReason: "tool-calls",
        usage: usage(),
        warnings: [],
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-1",
            toolName: "finish_audit",
            input: JSON.stringify({ manifest: validManifest }),
          },
        ],
      },
    ]);
    const result = await runOrchestrator({
      domain: "example.com",
      userId: "u-1",
      model,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      tools: {},
    });
    const stepUsageEvents = result.events.filter((e) => e.kind === "step_usage");
    expect(stepUsageEvents.length).toBeGreaterThan(0);
    for (const e of stepUsageEvents) {
      if (e.kind === "step_usage") {
        expect(typeof e.durationMs).toBe("number");
        expect(e.durationMs ?? 0).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("injects watchdog system message at the configured interval", async () => {
    // Test no-op tool to drive a non-finish step.
    const noopTool = defineTool({
      name: "noop",
      description: "test no-op",
      inputSchema: z.object({}),
      outputSchema: z.object({ done: z.literal(true) }),
      async execute() {
        return { done: true as const };
      },
    });

    const model = new SequenceMockModel([
      // Step 0: call noop. Watchdog hasn't fired (toolCount=0 at prepareStep).
      {
        finishReason: "tool-calls",
        usage: usage(),
        warnings: [],
        content: [
          { type: "tool-call", toolCallId: "tc-1", toolName: "noop", input: JSON.stringify({}) },
        ],
      },
      // Step 1: prepareStep sees toolCount=1, interval=1 → watchdog fires.
      // Model returns finish_audit, which terminates the session.
      {
        finishReason: "tool-calls",
        usage: usage(),
        warnings: [],
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-2",
            toolName: "finish_audit",
            input: JSON.stringify({ manifest: validManifest }),
          },
        ],
      },
    ]);

    const result = await runOrchestrator({
      domain: "example.com",
      userId: "u-1",
      model,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      tools: { noop: noopTool },
      budget: { watchdogIntervalCalls: 1 },
    });

    const watchdogEvents = result.events.filter((e) => e.kind === "watchdog_injected");
    expect(watchdogEvents.length).toBeGreaterThanOrEqual(1);
    if (watchdogEvents[0].kind === "watchdog_injected") {
      expect(watchdogEvents[0].toolCallCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not inject watchdog when interval is 0 (disabled)", async () => {
    const noopTool = defineTool({
      name: "noop",
      description: "test no-op",
      inputSchema: z.object({}),
      outputSchema: z.object({ done: z.literal(true) }),
      async execute() {
        return { done: true as const };
      },
    });

    const model = new SequenceMockModel([
      {
        finishReason: "tool-calls",
        usage: usage(),
        warnings: [],
        content: [
          { type: "tool-call", toolCallId: "tc-1", toolName: "noop", input: JSON.stringify({}) },
        ],
      },
      {
        finishReason: "tool-calls",
        usage: usage(),
        warnings: [],
        content: [
          {
            type: "tool-call",
            toolCallId: "tc-2",
            toolName: "finish_audit",
            input: JSON.stringify({ manifest: validManifest }),
          },
        ],
      },
    ]);

    const result = await runOrchestrator({
      domain: "example.com",
      userId: "u-1",
      model,
      providerId: "anthropic",
      modelId: "claude-sonnet-4-6",
      tools: { noop: noopTool },
      budget: { watchdogIntervalCalls: 0 },
    });

    const watchdogEvents = result.events.filter((e) => e.kind === "watchdog_injected");
    expect(watchdogEvents).toHaveLength(0);
  });
});
