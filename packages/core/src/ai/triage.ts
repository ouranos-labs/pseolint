import { createHash } from "node:crypto";
import type { RuleResult } from "../types.js";
import type { LlmAdapter, TriageResult } from "./types.js";
import { AdapterError } from "./types.js";
import {
  PROMPT_VERSION,
  MAX_FINDINGS_IN_PROMPT,
  assignFindingId,
  buildPromptRequest,
  parseAndValidateTriageJson,
} from "./prompt.js";
import { readTriageCache, writeTriageCache, triageCacheKey } from "./cache.js";
import { estimateCostUsd } from "./cost.js";

export interface TriageOptions {
  enabled: boolean;
  adapter: LlmAdapter;
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
const DEFAULT_MAX_OUTPUT_TOKENS = 1_500;

function hashFindings(findings: RuleResult[]): string {
  const ids = findings.map(assignFindingId).sort();
  return createHash("sha256").update(ids.join("|")).digest("hex");
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
  const estimate = options.adapter.estimateInputTokens(req);
  if (estimate > maxInputTokens) {
    return { skipReason: `pre-flight token estimate ${estimate} exceeds cap ${maxInputTokens}` };
  }

  const validIds = new Set<string>();
  for (const f of findings) validIds.add(assignFindingId(f));

  const cacheKey = triageCacheKey({
    findingsHash: hashFindings(findings),
    model: options.adapter.model,
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

  let response;
  try {
    response = await options.adapter.chat(req, {
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      signal: options.signal,
    });
  } catch (e) {
    if (e instanceof AdapterError) {
      return { skipReason: `${e.kind}: ${e.message}` };
    }
    if (e instanceof Error && (e.name === "AbortError" || /abort/i.test(e.message))) {
      return { skipReason: "aborted during adapter call" };
    }
    return { skipReason: `unexpected adapter error: ${(e as Error).message}` };
  }

  let parsed;
  try {
    parsed = parseAndValidateTriageJson(response.text, validIds);
  } catch (e) {
    return { skipReason: `invalid LLM response: ${(e as Error).message}` };
  }

  const result: TriageResult = {
    rootCauses: parsed.rootCauses,
    narrative: parsed.narrative,
    modelUsed: options.adapter.model,
    providerId: options.adapter.id,
    tokenUsage: response.usage,
    estimatedCostUsd: estimateCostUsd(options.adapter.id, options.adapter.model, response.usage),
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
