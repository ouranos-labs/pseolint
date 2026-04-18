import type { Severity } from "../types.js";
import type { ProviderId } from "./adapters/index.js";

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
  narrative: string;
  modelUsed: string;
  providerId: ProviderId;
  tokenUsage: TokenUsage;
  estimatedCostUsd?: number;
  cacheHit: boolean;
  promptVersion: string;
  truncatedInput: boolean;
}
