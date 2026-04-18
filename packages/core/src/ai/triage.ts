import { createHash } from "node:crypto";
import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import type { RuleResult } from "../types.js";
import type { TriageResult } from "./types.js";
import {
  PROMPT_VERSION,
  MAX_FINDINGS_IN_PROMPT,
  assignFindingId,
  buildPromptRequest,
} from "./prompt.js";
import { readTriageCache, writeTriageCache, triageCacheKey } from "./cache.js";
import { estimateCostUsd } from "./cost.js";

const SEVERITIES = ["info", "warning", "error", "critical"] as const;

const rootCauseSchema = z.object({
  label: z.string().min(1).max(80).describe("Short problem statement, <= 80 chars."),
  findingsCount: z.number().int().nonnegative().describe("How many of the input findings this root cause covers."),
  affectedRuleIds: z.array(z.string()).describe("Rule IDs (e.g. spam/near-duplicate) whose findings share this root cause."),
  severity: z.enum(SEVERITIES).describe("Overall severity of this root cause: info | warning | error | critical."),
  fixOrder: z.number().int().min(1).describe("1-indexed order to fix this in. 1 = highest priority."),
  rationale: z.string().min(1).describe("1-2 sentences: why this matters and how to fix it."),
  relatedFindingIds: z.array(z.string()).describe("IDs (from the input `findings[].id`) of findings attributed to this root cause. Use only IDs that appear in the input."),
});

const triagePayloadSchema = z.object({
  rootCauses: z.array(rootCauseSchema).min(1).max(5).describe("1 to 5 root causes, ranked by SEO impact (highest first)."),
  narrative: z.string().optional().describe("1-2 sentence overall summary. Optional — if output is tight, prioritize rootCauses and omit this."),
});

export interface TriageOptions {
  enabled: boolean;
  model: LanguageModel;
  providerId: string;
  modelId: string;
  maxInputTokens?: number;
  maxOutputTokens?: number;
  cache?: { dir: string; ttlMs: number } | false;
  signal?: AbortSignal;
}

export interface TriageOutcome {
  result?: TriageResult;
  skipReason?: string;
}

const DEFAULT_MAX_INPUT_TOKENS = 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 4_000;

function hashFindings(findings: RuleResult[]): string {
  const ids = findings.map(assignFindingId).sort();
  return createHash("sha256").update(ids.join("|")).digest("hex");
}

/** Rough token estimate: ~4 chars per token. Used only for the pre-flight cap. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function triageFindings(
  findings: RuleResult[],
  pageCount: number,
  options: TriageOptions,
): Promise<TriageOutcome> {
  if (options.signal?.aborted) {
    return { skipReason: "aborted before triage started" };
  }

  const req = buildPromptRequest(findings, pageCount);
  const truncatedInput = findings.length > MAX_FINDINGS_IN_PROMPT;

  const maxInputTokens = options.maxInputTokens ?? DEFAULT_MAX_INPUT_TOKENS;
  const estimate = estimateTokens(req.system + req.user);
  if (estimate > maxInputTokens) {
    return { skipReason: `pre-flight token estimate ${estimate} exceeds cap ${maxInputTokens}` };
  }

  const validIds = new Set<string>();
  for (const f of findings) validIds.add(assignFindingId(f));

  const cacheKey = triageCacheKey({
    findingsHash: hashFindings(findings),
    model: options.modelId,
    promptVersion: PROMPT_VERSION,
  });

  if (options.cache) {
    try {
      const cached = await readTriageCache(options.cache.dir, cacheKey, options.cache.ttlMs);
      if (cached) {
        return { result: { ...cached, cacheHit: true } };
      }
    } catch {
      // cache read errors are non-fatal — fall through to fresh call
    }
  }

  let generated;
  try {
    generated = await generateObject({
      model: options.model,
      system: req.system,
      prompt: req.user,
      schema: triagePayloadSchema,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      abortSignal: options.signal,
    });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    if (err?.name === "AbortError" || (err?.message && /abort/i.test(err.message))) {
      return { skipReason: "aborted during LLM call" };
    }
    return { skipReason: `LLM call failed: ${err?.message ?? String(e)}` };
  }

  // Validate relatedFindingIds reference known findings (semantic check
  // beyond the structural schema enforcement performed by generateObject).
  for (const [i, c] of generated.object.rootCauses.entries()) {
    for (const id of c.relatedFindingIds) {
      if (!validIds.has(id)) {
        return { skipReason: `LLM returned unknown finding id at rootCauses[${i}]: ${id}` };
      }
    }
  }

  const usage = {
    input: generated.usage.inputTokens ?? 0,
    output: generated.usage.outputTokens ?? 0,
  };

  const result: TriageResult = {
    rootCauses: generated.object.rootCauses,
    narrative: generated.object.narrative,
    modelUsed: options.modelId,
    providerId: options.providerId,
    tokenUsage: usage,
    estimatedCostUsd: estimateCostUsd(options.providerId, options.modelId, usage),
    cacheHit: false,
    promptVersion: PROMPT_VERSION,
    truncatedInput,
  };

  if (options.cache) {
    try {
      await writeTriageCache(options.cache.dir, cacheKey, result);
    } catch {
      // cache write errors are non-fatal
    }
  }

  return { result };
}
