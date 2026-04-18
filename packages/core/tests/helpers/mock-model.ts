import type { LanguageModelV2, LanguageModelV2Usage, LanguageModelV2FinishReason, LanguageModelV2Content, LanguageModelV2CallOptions, LanguageModelV2CallWarning } from "@ai-sdk/provider";

type DoGenerateResult = {
  content: Array<LanguageModelV2Content>;
  finishReason: LanguageModelV2FinishReason;
  usage: LanguageModelV2Usage;
  warnings: Array<LanguageModelV2CallWarning>;
};

type DoGenerateFn = (options: LanguageModelV2CallOptions) => Promise<DoGenerateResult>;

/**
 * Minimal implementation of the AI SDK v5 `LanguageModelV2` interface for
 * tests. Intentionally does NOT use `ai/test`'s `MockLanguageModelV2`, which
 * transitively imports `msw` and inflates our test dep graph.
 */
export class MockModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const;
  readonly provider = "mock";
  readonly modelId = "mock-model";
  readonly supportedUrls = {};

  private readonly _doGenerate: DoGenerateFn;

  constructor(options: { doGenerate: DoGenerateFn }) {
    this._doGenerate = options.doGenerate;
  }

  doGenerate(options: LanguageModelV2CallOptions): Promise<DoGenerateResult> {
    return this._doGenerate(options);
  }

  doStream(): never {
    throw new Error("MockModel.doStream is not implemented");
  }
}

export interface OkResponseOptions {
  /** Token counts to report. Defaults to 100/50. */
  usage?: { input: number; output: number };
}

/** Build a `doGenerate` result with the given JSON-serialized body. */
export function okResponse(body: object, opts: OkResponseOptions = {}): DoGenerateResult {
  const input = opts.usage?.input ?? 100;
  const output = opts.usage?.output ?? 50;
  return {
    finishReason: "stop",
    usage: { inputTokens: input, outputTokens: output, totalTokens: input + output },
    content: [{ type: "text", text: JSON.stringify(body) }],
    warnings: [],
  };
}
