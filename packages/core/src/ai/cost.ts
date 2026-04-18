import type { TokenUsage } from "./types.js";

interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
}

/**
 * Best-effort pricing table. Missing entries return `undefined` — callers
 * must treat unknown cost as "not estimable" rather than zero. Ollama and
 * other local providers intentionally return undefined.
 */
const PRICING: Record<string, ModelPricing> = {
  "anthropic:claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0 },
  "anthropic:claude-opus-4-7": { inputPerM: 15.0, outputPerM: 75.0 },
  "anthropic:claude-haiku-4-5-20251001": { inputPerM: 0.8, outputPerM: 4.0 },
  "openai:gpt-4o": { inputPerM: 2.5, outputPerM: 10.0 },
  "openai:gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
  "google:gemini-2.5-pro": { inputPerM: 1.25, outputPerM: 10.0 },
  "google:gemini-2.5-flash": { inputPerM: 0.3, outputPerM: 2.5 },
};

export function estimateCostUsd(providerId: string, model: string, usage: TokenUsage): number | undefined {
  const key = `${providerId}:${model}`;
  const pricing = PRICING[key];
  if (!pricing) return undefined;
  return (usage.input / 1_000_000) * pricing.inputPerM + (usage.output / 1_000_000) * pricing.outputPerM;
}
