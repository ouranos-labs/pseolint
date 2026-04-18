import { createHash } from "node:crypto";
import type { RuleResult, Severity } from "../types.js";
import type { LlmRequest, RootCause } from "./types.js";

export const PROMPT_VERSION = "1.0.0";
export const MAX_FINDINGS_IN_PROMPT = 200;

const SEVERITY_ORDER: Record<Severity, number> = { info: 0, warning: 1, error: 2, critical: 3 };
const SEVERITIES: Severity[] = ["info", "warning", "error", "critical"];

const SYSTEM_PROMPT = `You are an SEO audit triage assistant. Given a list of pSEO linter findings, identify 1-5 underlying ROOT CAUSES driving the findings. Group findings by shared underlying problem, not by rule ID. Rank causes by likely SEO impact (highest first).

Output STRICT JSON matching this schema:
{
  "rootCauses": [{
    "label": "string, <=80 chars, problem statement",
    "findingsCount": number,
    "affectedRuleIds": ["rule-id", ...],
    "severity": "info" | "warning" | "error" | "critical",
    "fixOrder": number (1 = fix first),
    "rationale": "string, 1-2 sentences explaining impact and fix",
    "relatedFindingIds": ["finding-id", ...]
  }],
  "narrative": "string, 2-3 sentence overall summary"
}

Rules:
- Use only finding ids that appear in the input.
- DO NOT include markdown, code fences, or commentary.
- Output ONLY the JSON object.`;

export function assignFindingId(f: RuleResult): string {
  const hash = createHash("sha256").update((f.pageUrl ?? "") + "|" + f.message).digest("hex").slice(0, 8);
  return `${f.ruleId}:${hash}`;
}

interface FindingProjection {
  id: string;
  ruleId: string;
  severity: Severity;
  message: string;
  pageUrl?: string;
  group?: string;
}

interface PromptPayload {
  totalFindings: number;
  pageCount: number;
  truncated: boolean;
  findings: FindingProjection[];
  findingCountByRule?: Record<string, number>;
}

export function buildPromptRequest(findings: RuleResult[], pageCount: number): LlmRequest {
  const total = findings.length;
  const sorted = [...findings].sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  const truncated = total > MAX_FINDINGS_IN_PROMPT;
  const projected = sorted.slice(0, MAX_FINDINGS_IN_PROMPT).map((f): FindingProjection => ({
    id: assignFindingId(f),
    ruleId: f.ruleId,
    severity: f.severity,
    message: f.message,
    pageUrl: f.pageUrl,
    group: f.group,
  }));

  const payload: PromptPayload = {
    totalFindings: total,
    pageCount,
    truncated,
    findings: projected,
  };

  if (truncated) {
    const counts: Record<string, number> = {};
    for (const f of findings) counts[f.ruleId] = (counts[f.ruleId] ?? 0) + 1;
    payload.findingCountByRule = counts;
  }

  return {
    system: SYSTEM_PROMPT,
    user: JSON.stringify(payload),
  };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
  const m = trimmed.match(fence);
  return m ? m[1].trim() : trimmed;
}

interface ParsedTriagePayload {
  rootCauses: RootCause[];
  narrative: string;
}

export function parseAndValidateTriageJson(text: string, validFindingIds: Set<string>): ParsedTriagePayload {
  const stripped = stripCodeFences(text);
  let raw: unknown;
  try {
    raw = JSON.parse(stripped);
  } catch (e) {
    throw new Error(`failed to parse LLM response as JSON: ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== "object") throw new Error("response is not an object");
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.rootCauses)) throw new Error("response missing rootCauses array");
  if (typeof obj.narrative !== "string") throw new Error("response missing narrative string");

  const rootCauses: RootCause[] = obj.rootCauses.map((c, i) => validateRootCause(c, i, validFindingIds));
  return { rootCauses, narrative: obj.narrative };
}

function validateRootCause(raw: unknown, index: number, validFindingIds: Set<string>): RootCause {
  if (!raw || typeof raw !== "object") throw new Error(`rootCauses[${index}] is not an object`);
  const c = raw as Record<string, unknown>;
  const label = c.label;
  if (typeof label !== "string" || label.length === 0) throw new Error(`rootCauses[${index}].label must be a non-empty string`);
  if (label.length > 80) throw new Error(`rootCauses[${index}].label exceeds 80 chars`);

  const findingsCount = c.findingsCount;
  if (typeof findingsCount !== "number" || findingsCount < 0) throw new Error(`rootCauses[${index}].findingsCount must be >= 0`);

  const affectedRuleIds = c.affectedRuleIds;
  if (!Array.isArray(affectedRuleIds) || !affectedRuleIds.every((s) => typeof s === "string")) {
    throw new Error(`rootCauses[${index}].affectedRuleIds must be string[]`);
  }

  const severity = c.severity;
  if (typeof severity !== "string" || !SEVERITIES.includes(severity as Severity)) {
    throw new Error(`rootCauses[${index}].severity must be one of ${SEVERITIES.join(", ")}`);
  }

  const fixOrder = c.fixOrder;
  if (typeof fixOrder !== "number" || fixOrder < 1) throw new Error(`rootCauses[${index}].fixOrder must be >= 1`);

  const rationale = c.rationale;
  if (typeof rationale !== "string") throw new Error(`rootCauses[${index}].rationale must be string`);

  const relatedFindingIds = c.relatedFindingIds;
  if (!Array.isArray(relatedFindingIds) || !relatedFindingIds.every((s) => typeof s === "string")) {
    throw new Error(`rootCauses[${index}].relatedFindingIds must be string[]`);
  }
  for (const id of relatedFindingIds) {
    if (!validFindingIds.has(id as string)) throw new Error(`rootCauses[${index}].relatedFindingIds contains unknown finding id: ${id}`);
  }

  return {
    label,
    findingsCount,
    affectedRuleIds: affectedRuleIds as string[],
    severity: severity as Severity,
    fixOrder,
    rationale,
    relatedFindingIds: relatedFindingIds as string[],
  };
}
