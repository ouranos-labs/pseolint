import type { Severity } from "../types.js";

export interface LlmRequest {
  system: string;
  user: string;
}

export interface TokenUsage {
  input: number;
  output: number;
}

export interface LlmResponse {
  text: string;
  usage: TokenUsage;
}

export type ProviderId = "anthropic" | "ollama";

export interface LlmAdapter {
  readonly id: ProviderId;
  readonly model: string;
  chat(req: LlmRequest, opts?: { maxOutputTokens?: number; signal?: AbortSignal }): Promise<LlmResponse>;
  estimateInputTokens(req: LlmRequest): number;
}

export type AdapterErrorKind =
  | "auth"
  | "network"
  | "rate-limit"
  | "server"
  | "sdk-missing"
  | "invalid-response";

export class AdapterError extends Error {
  constructor(
    message: string,
    public readonly kind: AdapterErrorKind,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

export interface RootCause {
  label: string;
  findingsCount: number;
  affectedRuleIds: string[];
  severity: Severity;
  fixOrder: number;
  rationale: string;
  relatedFindingIds: string[];
}

export interface TriageResult {
  rootCauses: RootCause[];
  narrative: string;
  modelUsed: string;
  providerId: ProviderId;
  tokenUsage: TokenUsage;
  estimatedCostUsd?: number;
  cacheHit: boolean;
  promptVersion: string;
  truncatedInput: boolean;
}
