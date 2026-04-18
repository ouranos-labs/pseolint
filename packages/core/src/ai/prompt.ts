import { createHash } from "node:crypto";
import type { RuleResult, Severity } from "../types.js";

export const PROMPT_VERSION = "1.0.0";
export const MAX_FINDINGS_IN_PROMPT = 200;

const SEVERITY_ORDER: Record<Severity, number> = { info: 0, warning: 1, error: 2, critical: 3 };

const SYSTEM_PROMPT = `You are an SEO audit triage assistant. Given a list of pSEO linter findings, identify 1-5 underlying ROOT CAUSES driving the findings. Group findings by shared underlying problem, not by rule ID. Rank causes by likely SEO impact (highest first).

Rules:
- Emit rootCauses FIRST, then narrative — do not reverse this order.
- Keep each rootCause label <= 80 chars and phrase it as a problem statement.
- Keep each rationale to 1-2 sentences (about 30-40 words max).
- fixOrder starts at 1 for the highest-priority root cause.
- Use only finding ids that appear in the input for relatedFindingIds.
- narrative is a SHORT 1-2 sentence overall summary (about 30 words max).
- Be concise. This is a structured report, not prose.`;

export interface PromptRequest {
  system: string;
  user: string;
}

export function assignFindingId(f: RuleResult): string {
  const hash = createHash("sha256")
    .update((f.pageUrl ?? "") + "|" + f.message)
    .digest("hex")
    .slice(0, 8);
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

export function buildPromptRequest(findings: RuleResult[], pageCount: number): PromptRequest {
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
