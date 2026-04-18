import type { LlmAdapter, LlmRequest, LlmResponse, ProviderId, TokenUsage } from "../../src/ai/types.js";
import { AdapterError, type AdapterErrorKind } from "../../src/ai/types.js";

export interface StubAdapterOptions {
  id?: ProviderId;
  model?: string;
  /** Fixed text to return; overrides `respondWith` when set. */
  text?: string;
  /** Function to compute response text from request (e.g., for snapshot tests). */
  respondWith?: (req: LlmRequest) => string;
  /** Token usage to report. Defaults to char/4 estimate. */
  usage?: TokenUsage;
  /** Throw an AdapterError of this kind on `chat()` instead of responding. */
  throwKind?: AdapterErrorKind;
  /** Override the input-token estimate. Defaults to char/4. */
  estimateOverride?: number;
  /** Records calls for assertions. */
  calls: LlmRequest[];
}

export function createStubAdapter(opts: Partial<StubAdapterOptions> = {}): LlmAdapter & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    id: opts.id ?? "anthropic",
    model: opts.model ?? "claude-sonnet-4-6",
    calls,
    async chat(req: LlmRequest, _opts): Promise<LlmResponse> {
      calls.push(req);
      if (opts.throwKind) {
        throw new AdapterError(`stub error: ${opts.throwKind}`, opts.throwKind);
      }
      const text = opts.text ?? (opts.respondWith ? opts.respondWith(req) : "{}");
      const usage =
        opts.usage ??
        {
          input: Math.ceil((req.system.length + req.user.length) / 4),
          output: Math.ceil(text.length / 4),
        };
      return { text, usage };
    },
    estimateInputTokens(req: LlmRequest): number {
      return opts.estimateOverride ?? Math.ceil((req.system.length + req.user.length) / 4);
    },
  };
}
