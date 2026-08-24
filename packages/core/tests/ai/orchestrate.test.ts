import { describe, it, expect } from "vitest";
import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2Usage,
  LanguageModelV2CallWarning,
} from "@ai-sdk/provider";
import { orchestrate } from "../../src/ai/orchestrate.js";

type DoGenerateResult = {
  content: Array<LanguageModelV2Content>;
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelV2Usage;
  warnings: Array<LanguageModelV2CallWarning>;
};

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
    if (!r) throw new Error(`SequenceMockModel: no response for call ${i}`);
    return r;
  }

  doStream(): never {
    throw new Error("SequenceMockModel.doStream is not implemented");
  }
}

const validManifest = {
  domain: "example.com",
  verdict: "caution" as const,
  categories: { integrity: "B", discoverability: "B", citation: "C", data: "A" },
  templates: [],
  pages: [
    {
      url: "https://example.com/a",
      changes: [
        { type: "replace_h1" as const, before: "Old", after: "Better H1 With Specifics", reason: "AEO opener" },
      ],
    },
  ],
  domainLevel: [
    {
      type: "robots_txt" as const,
      before: null,
      after: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
      reason: "add sitemap directive",
    },
  ],
};

const usage = (input = 100, output = 50) => ({
  inputTokens: input,
  outputTokens: output,
  totalTokens: input + output,
});

describe("orchestrate (public composition entry point)", () => {
  it("composes runner + validation + diff into a single result on happy path", async () => {
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

    const result = await orchestrate({
      domain: "https://example.com",
      userId: "u-1",
      _resolvedModel: { model, providerId: "anthropic", modelId: "claude-sonnet-4-6" },
    });

    // Composition contract: all four fields populated when manifest is produced.
    expect(result.session.reason).toBe("completed");
    expect(result.manifest).not.toBeNull();
    expect(result.validation).not.toBeNull();
    expect(result.diff).not.toBeNull();

    // Manifest passed through.
    expect(result.manifest?.domain).toBe("example.com");
    expect(result.manifest?.pages).toHaveLength(1);

    // Validation report walks every patch (1 page change + 1 domain patch = 2).
    expect(result.validation?.totalPatches).toBe(2);
    expect(result.validation?.validPatches).toBe(2);
    expect(result.validation?.failures).toEqual([]);

    // Diff mirrors the manifest's tree shape.
    expect(result.diff?.pages).toHaveLength(1);
    expect(result.diff?.pages[0].diffs[0].kind).toBe("text_replace");
    expect(result.diff?.domainLevel).toHaveLength(1);
    expect(result.diff?.domainLevel[0].kind).toBe("file_replace");
  });

  it("returns null manifest/validation/diff when the session doesn't call finish_audit", async () => {
    // Mock returns a stop with no tool call: simulates the model giving up
    // without producing a manifest.
    const model = new SequenceMockModel([
      {
        finishReason: "stop",
        usage: usage(),
        warnings: [],
        content: [{ type: "text", text: "I cannot complete this audit." }],
      },
    ]);

    const result = await orchestrate({
      domain: "https://example.com",
      userId: "u-1",
      _resolvedModel: { model, providerId: "anthropic", modelId: "claude-sonnet-4-6" },
    });

    expect(result.session.reason).toBe("no_finish_called");
    expect(result.manifest).toBeNull();
    expect(result.validation).toBeNull();
    expect(result.diff).toBeNull();
  });

  it("surfaces validation failures alongside the manifest when patches are bad", async () => {
    // Manifest with a no-op H1 (validator rejects identical before/after).
    const badManifest = {
      ...validManifest,
      pages: [
        {
          url: "https://example.com/a",
          changes: [
            { type: "replace_h1" as const, before: "Same", after: "Same", reason: "noop" },
          ],
        },
      ],
    };

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
            input: JSON.stringify({ manifest: badManifest }),
          },
        ],
      },
    ]);

    const result = await orchestrate({
      domain: "https://example.com",
      userId: "u-1",
      _resolvedModel: { model, providerId: "anthropic", modelId: "claude-sonnet-4-6" },
    });

    expect(result.manifest).not.toBeNull();
    // 1 page patch (fails: noop H1) + 1 domain patch (passes: valid robots.txt)
    expect(result.validation?.totalPatches).toBe(2);
    expect(result.validation?.validPatches).toBe(1);
    expect(result.validation?.failures).toHaveLength(1);
    expect(result.validation?.failures[0].location.kind).toBe("page_patch");
    expect(result.validation?.failures[0].reason).toMatch(/identical|noop/i);
  });

  it("threads onEvent callback through the session", async () => {
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

    await orchestrate({
      domain: "https://example.com",
      userId: "u-1",
      _resolvedModel: { model, providerId: "anthropic", modelId: "claude-sonnet-4-6" },
      onEvent: (e) => {
        seen.push(e.kind);
      },
    });

    expect(seen[0]).toBe("session_started");
    expect(seen[seen.length - 1]).toBe("session_finished");
  });
});
