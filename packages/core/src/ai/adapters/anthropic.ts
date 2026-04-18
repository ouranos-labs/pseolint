import { AdapterError, type LlmAdapter, type LlmRequest, type LlmResponse } from "../types.js";

export interface AnthropicAdapterConfig {
  model: string;
  apiKey?: string;
}

/**
 * Minimal client surface used by the adapter. Mirrors the subset of the
 * `@anthropic-ai/sdk` `Anthropic` instance we actually call.
 */
export interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: { input_tokens: number; output_tokens: number };
    }>;
  };
}

/**
 * Factory function that produces an Anthropic-compatible client. The default
 * implementation lazily imports `@anthropic-ai/sdk` (an optional peer dep);
 * tests can override this via `__setAnthropicClientFactory` to inject a fake.
 */
export type AnthropicClientFactory = (apiKey: string) => AnthropicClient | Promise<AnthropicClient>;

const defaultFactory: AnthropicClientFactory = async (apiKey: string) => {
  // The SDK is an optional peer dependency — use an indirect import so tsc
  // does not attempt to resolve its types at build time. Users who opt into
  // the Anthropic adapter install `@anthropic-ai/sdk` separately.
  const specifier = "@anthropic-ai/sdk";
  let mod: { default: new (opts: { apiKey: string }) => AnthropicClient };
  try {
    mod = (await import(/* @vite-ignore */ specifier)) as unknown as {
      default: new (opts: { apiKey: string }) => AnthropicClient;
    };
  } catch (e) {
    throw new AdapterError(
      "@anthropic-ai/sdk not installed. Run: npm install @anthropic-ai/sdk",
      "sdk-missing",
      e,
    );
  }
  return new mod.default({ apiKey });
};

let clientFactory: AnthropicClientFactory = defaultFactory;

/**
 * Test hook: replace the Anthropic client factory with a stub. Use
 * `__resetAnthropicClientFactory()` to restore the real lazy importer.
 */
export function __setAnthropicClientFactory(factory: AnthropicClientFactory): void {
  clientFactory = factory;
}

export function __resetAnthropicClientFactory(): void {
  clientFactory = defaultFactory;
}

function mapSdkError(e: unknown): never {
  const err = e as { status?: number; message?: string; name?: string };
  if (err?.name === "AbortError") throw e;
  // Re-throw AdapterError instances unchanged (preserves sdk-missing kind).
  if (e instanceof AdapterError) throw e;
  const status = err?.status;
  if (status === 401 || status === 403) {
    throw new AdapterError(`Anthropic auth failed: ${err.message ?? status}`, "auth", e);
  }
  if (status === 429) {
    throw new AdapterError(`Anthropic rate-limited`, "rate-limit", e);
  }
  if (typeof status === "number" && status >= 500) {
    throw new AdapterError(`Anthropic server error ${status}`, "server", e);
  }
  if (typeof status === "number") {
    throw new AdapterError(
      `Anthropic returned ${status}: ${err.message ?? ""}`,
      "invalid-response",
      e,
    );
  }
  throw new AdapterError(`Anthropic network error: ${err?.message ?? "unknown"}`, "network", e);
}

export function createAnthropicAdapter(config: AnthropicAdapterConfig): LlmAdapter {
  return {
    id: "anthropic",
    model: config.model,
    estimateInputTokens(req: LlmRequest): number {
      return Math.ceil((req.system.length + req.user.length) / 4);
    },
    async chat(req: LlmRequest, opts): Promise<LlmResponse> {
      const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new AdapterError("No Anthropic API key (set ANTHROPIC_API_KEY)", "auth");
      }

      let client: AnthropicClient;
      try {
        client = await clientFactory(apiKey);
      } catch (e) {
        // sdk-missing or other factory-time error.
        if (e instanceof AdapterError) throw e;
        throw new AdapterError(
          `Failed to initialize Anthropic client: ${(e as Error).message}`,
          "sdk-missing",
          e,
        );
      }

      let resp: Awaited<ReturnType<AnthropicClient["messages"]["create"]>>;
      try {
        resp = await client.messages.create({
          model: config.model,
          max_tokens: opts?.maxOutputTokens ?? 1500,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        });
      } catch (e) {
        mapSdkError(e);
      }

      const text = resp.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
      if (!text) {
        throw new AdapterError("Anthropic response had no text content", "invalid-response");
      }
      return {
        text,
        usage: {
          input: resp.usage.input_tokens,
          output: resp.usage.output_tokens,
        },
      };
    },
  };
}
