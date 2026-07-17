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
  /**
   * Inferred programmatic-SEO archetype the root causes were prioritized for.
   * Optional: absent on triage results cached before prompt v1.2.0.
   */
  archetype?: "directory" | "comparison" | "location-pages" | "glossary" | "aggregator" | "programmatic-blog" | "other";
  /** One-line justification for {@link archetype}. */
  archetypeRationale?: string;
  modelUsed: string;
  providerId: string;
  tokenUsage: TokenUsage;
  estimatedCostUsd?: number;
  cacheHit: boolean;
  promptVersion: string;
  truncatedInput: boolean;
}
