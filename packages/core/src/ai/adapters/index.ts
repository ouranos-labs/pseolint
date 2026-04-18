import { createAnthropic } from "@ai-sdk/anthropic";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";
import type { AiOptions } from "../../types.js";

export type ProviderId = "anthropic" | "ollama";

export interface ResolvedModel {
  model: LanguageModel;
  providerId: ProviderId;
  modelId: string;
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

/**
 * Resolve an AI SDK `LanguageModel` for the requested (or auto-detected) provider.
 *
 * Returns a Promise regardless of whether `provider` was explicit — auto-detect
 * is async, and keeping a single signature simplifies callers.
 */
export async function createLanguageModel(config: AiOptions): Promise<ResolvedModel> {
  const providerId = config.provider ?? (await detectProvider(config.endpoint));
  if (!providerId) {
    throw new Error(
      "No AI provider configured. Set ANTHROPIC_API_KEY, run Ollama locally, or pass --ai-provider.",
    );
  }
  if (providerId === "anthropic") {
    const modelId = config.model ?? DEFAULT_MODEL.anthropic;
    const anthropic = createAnthropic({
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    return { model: anthropic(modelId), providerId, modelId };
  }
  const modelId = config.model ?? DEFAULT_MODEL.ollama;
  const baseURL = (config.endpoint ?? DEFAULT_OLLAMA_ENDPOINT).replace(/\/+$/, "") + "/api";
  const ollama = createOllama({ baseURL });
  return { model: ollama(modelId), providerId, modelId };
}
