import type { Severity } from "../types.js";

export interface TokenUsage {
  input: number;
  output: number;
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
  /** Optional — may be absent when the model ran tight on output tokens. */
  narrative?: string;
  modelUsed: string;
  providerId: string;
  tokenUsage: TokenUsage;
  estimatedCostUsd?: number;
  cacheHit: boolean;
  promptVersion: string;
  truncatedInput: boolean;
}
