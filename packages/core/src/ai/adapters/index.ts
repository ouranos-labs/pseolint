import { AdapterError, type LlmAdapter, type ProviderId } from "../types.js";
import { createAnthropicAdapter } from "./anthropic.js";
import { createOllamaAdapter } from "./ollama.js";

export interface AdapterFactoryConfig {
  provider?: ProviderId;
  model?: string;
  apiKey?: string;
  endpoint?: string;
}

const DEFAULT_MODEL: Record<ProviderId, string> = {
  anthropic: "claude-sonnet-4-6",
  ollama: "llama3.1:8b",
};

const OLLAMA_DETECT_TIMEOUT_MS = 500;
const DEFAULT_OLLAMA_ENDPOINT = "http://localhost:11434";

/**
 * Best-effort provider auto-detection.
 *
 * Resolution order:
 *   1. `ANTHROPIC_API_KEY` env var set → "anthropic".
 *   2. Ollama daemon responding with 2xx/4xx at `<endpoint>/` → "ollama".
 *   3. Otherwise `null`.
 */
export async function detectProvider(endpoint?: string): Promise<ProviderId | null> {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  const url = (endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/+$/, "") + "/";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OLLAMA_DETECT_TIMEOUT_MS);
    const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    clearTimeout(timer);
    if (res.status >= 200 && res.status < 500) return "ollama";
    return null;
  } catch {
    return null;
  }
}

function buildAdapter(provider: ProviderId, config: AdapterFactoryConfig): LlmAdapter {
  const model = config.model ?? DEFAULT_MODEL[provider];
  if (provider === "anthropic") {
    return createAnthropicAdapter({ model, apiKey: config.apiKey });
  }
  return createOllamaAdapter({ model, endpoint: config.endpoint });
}

/**
 * Create an `LlmAdapter` for the requested (or auto-detected) provider.
 *
 * Returns a Promise regardless of whether `provider` was explicit — auto-detect
 * is async, and keeping a single signature simplifies callers.
 */
export async function createAdapter(config: AdapterFactoryConfig): Promise<LlmAdapter> {
  const provider = config.provider ?? (await detectProvider(config.endpoint));
  if (!provider) {
    throw new AdapterError(
      "No AI provider configured. Set ANTHROPIC_API_KEY, run Ollama locally, or pass --ai-provider.",
      "auth",
    );
  }
  return buildAdapter(provider, config);
}
