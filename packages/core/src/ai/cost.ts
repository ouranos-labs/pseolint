import type { ProviderId } from "./adapters/index.js";
import type { TokenUsage } from "./types.js";

interface ModelPricing {
  inputPerM: number;
  outputPerM: number;
}

const PRICING: Record<string, ModelPricing> = {
  "anthropic:claude-sonnet-4-6": { inputPerM: 3.0, outputPerM: 15.0 },
  "anthropic:claude-opus-4-7": { inputPerM: 15.0, outputPerM: 75.0 },
  "anthropic:claude-haiku-4-5-20251001": { inputPerM: 0.8, outputPerM: 4.0 },
};

export function estimateCostUsd(providerId: ProviderId, model: string, usage: TokenUsage): number | undefined {
  const key = `${providerId}:${model}`;
  const pricing = PRICING[key];
  if (!pricing) return undefined;
  return (usage.input / 1_000_000) * pricing.inputPerM + (usage.output / 1_000_000) * pricing.outputPerM;
}
