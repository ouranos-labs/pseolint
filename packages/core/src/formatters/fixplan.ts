import type { AuditSummary, FixEffort, RuleResult, Severity } from "../types.js";
import { inferUrlTemplate } from "../stratified-sample.js";

export interface FixplanFormatOptions {
  /** ISO date string (YYYY-MM-DD) used in the header. Defaults to today (UTC). */
  generatedDate?: string;
}

interface Bucket {
  ruleId: string;
  templateSignature: string;
  count: number;
  /** Highest-severity rank in this bucket (lower number = worse). */
  worstSeverityRank: number;
  worstSeverity: Severity;
  /** Effort, derived from the first finding that has one. Falls back to "other". */
  effort: FixEffort | "other";
  /** First finding seen — used for the narrative line + sample URL. */
  exemplar: RuleResult;
  /** Distinct page URLs in this bucket (in encounter order, deduped). */
  urls: string[];
}

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

const EFFORT_ORDER: Array<FixEffort | "other"> = [
  "quick",
  "moderate",
  "structural",
  "other",
];

const EFFORT_HEADING: Record<FixEffort | "other", string> = {
  quick: "Quick wins (≤ 30 min each)",
  moderate: "Moderate fixes (1-2 hours each)",
  structural: "Structural changes (deeper refactor)",
  other: "Other fixes",
};

/** Approximate hours-per-fix used in the footer estimate. */
const EFFORT_HOURS: Record<FixEffort | "other", number> = {
  quick: 0.5,
  moderate: 1.5,
  structural: 4,
  other: 1,
};

const VERDICT_LABEL: Record<AuditSummary["verdict"], string> = {
  ready: "ready",
  caution: "caution",
  concerning: "concerning",
  critical: "critical",
};

function shortenUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

/**
 * Resolve a template signature for bucketing. Prefer the enrichment-pipeline
 * field (`templateSignature` populated post Agent C), else derive one from the
 * page URL via `inferUrlTemplate`. Findings with no `pageUrl` (corpus-scoped
 * rules) get a synthetic `__corpus__` signature so they each land in their
 * own per-rule bucket.
 */
function templateSigFor(f: RuleResult): string {
  const sig = (f as RuleResult & { templateSignature?: string }).templateSignature;
  if (sig && sig.length > 0) return sig;
  if (f.pageUrl) return inferUrlTemplate(f.pageUrl);
  return "__corpus__";
}

function bucketByTemplate(findings: RuleResult[]): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const f of findings) {
    const sig = templateSigFor(f);
    const key = `${f.ruleId} ${sig}`;
    let b = map.get(key);
    const rank = SEVERITY_RANK[f.severity] ?? 3;
    if (!b) {
      b = {
        ruleId: f.ruleId,
        templateSignature: sig,
        count: 0,
        worstSeverityRank: rank,
        worstSeverity: f.severity,
        effort: f.effort ?? "other",
        exemplar: f,
        urls: [],
      };
      map.set(key, b);
    }
    b.count += 1;
    if (rank < b.worstSeverityRank) {
      b.worstSeverityRank = rank;
      b.worstSeverity = f.severity;
    }
    // Promote effort if the bucket was "other" but a later finding declares one.
    if (b.effort === "other" && f.effort) {
      b.effort = f.effort;
    }
    if (f.pageUrl && !b.urls.includes(f.pageUrl)) {
      b.urls.push(f.pageUrl);
    }
  }
  return Array.from(map.values());
}

function isTemplateBucket(b: Bucket): boolean {
  // A "template" bucket is one whose signature contains a generalised segment
  // (`:slug`, `:num`, `:id`, `:date`). Single-page or corpus buckets render
  // without the "x N instances on `<template>`" suffix.
  return /:slug|:num|:id|:date/.test(b.templateSignature);
}

function bucketHeadline(b: Bucket): string {
  const code = `\`${b.ruleId}\``;
  if (b.count > 1 && isTemplateBucket(b)) {
    return `**${code} × ${b.count} instances on \`${b.templateSignature}\` template**`;
  }
  if (b.count > 1) {
    return `**${code} × ${b.count} affected pages**`;
  }
  if (b.exemplar.pageUrl) {
    return `**${code} on \`${shortenUrl(b.exemplar.pageUrl)}\`**`;
  }
  return `**${code}**`;
}

function bucketNarrative(b: Bucket): string {
  // Prefer the explicit `fix` narrative when present; else paraphrase the
  // message. Hard-wrap the narrative onto a single bullet line.
  const text = (b.exemplar.fix ?? b.exemplar.message).trim();
  return text.endsWith(".") ? text : `${text}.`;
}

function renderBucketLines(b: Bucket): string[] {
  const lines: string[] = [];
  lines.push(`- [ ] ${bucketHeadline(b)} — ${bucketNarrative(b)}`);

  // Nested bullet: first concrete URL example (only useful when we have one).
  if (b.exemplar.pageUrl) {
    if (b.count > 1 && isTemplateBucket(b) && b.urls.length > 0) {
      const first = shortenUrl(b.urls[0]);
      const allShort = b.urls.slice(0, 4).map((u) => `\`${shortenUrl(u)}\``).join(", ");
      const more = b.urls.length > 4 ? `, +${b.urls.length - 4} more` : "";
      lines.push(`  - First instance: \`${first}\` — ${b.exemplar.message}`);
      lines.push(`  - Pages: ${allShort}${more}`);
    } else if (b.count === 1) {
      // Single-finding bucket: URL is already in the headline; show the raw
      // message as a secondary line so the user has the engine's verbatim
      // explanation alongside the fix narrative.
      if (b.exemplar.fix && b.exemplar.message && b.exemplar.fix !== b.exemplar.message) {
        lines.push(`  - ${b.exemplar.message}`);
      }
    }
  }
  return lines;
}

function renderEffortSection(
  effort: FixEffort | "other",
  buckets: Bucket[],
): string[] {
  if (buckets.length === 0) return [];
  const lines: string[] = [];
  lines.push(`## ${EFFORT_HEADING[effort]}`);
  lines.push("");
  for (const b of buckets) {
    lines.push(...renderBucketLines(b));
  }
  lines.push("");
  return lines;
}

interface SkipBreakdown {
  noindex: number;
  authDetected: number;
  contentHashUnchanged: number;
  other: number;
}

function summarizeSkips(summary: AuditSummary): SkipBreakdown {
  const out: SkipBreakdown = { noindex: 0, authDetected: 0, contentHashUnchanged: 0, other: 0 };
  const total = summary.skippedUrls?.length ?? 0;
  if (total === 0) return out;

  const policyFinding = summary.diagnostics?.auditFindings?.find(
    (f) => f.ruleId === "audit/skipped-by-policy",
  );
  if (policyFinding) {
    // The policy finding's message embeds counts like "3 marked noindex,
    // 2 detected as auth". Parse them out: cheap heuristic that matches the
    // auditor's own emit format.
    const noindex = /(\d+)\s+marked noindex/i.exec(policyFinding.message);
    const auth = /(\d+)\s+detected as auth/i.exec(policyFinding.message);
    if (noindex) out.noindex = Number(noindex[1]);
    if (auth) out.authDetected = Number(auth[1]);
  }

  // Whatever's left in skippedUrls but not accounted for by policy is most
  // likely state-cache (`--since` skipped contentHash-unchanged URLs).
  const policyTotal = out.noindex + out.authDetected;
  const remainder = Math.max(0, total - policyTotal);
  out.contentHashUnchanged = remainder;
  return out;
}

function renderSkippedSection(summary: AuditSummary): string[] {
  const total = summary.skippedUrls?.length ?? 0;
  if (total === 0) return [];

  const breakdown = summarizeSkips(summary);
  const lines: string[] = [];
  lines.push(`## Skipped this run`);
  lines.push("");
  if (breakdown.noindex > 0) {
    lines.push(`- ${breakdown.noindex} page${breakdown.noindex === 1 ? "" : "s"} skipped (noindex)`);
  }
  if (breakdown.authDetected > 0) {
    lines.push(
      `- ${breakdown.authDetected} page${breakdown.authDetected === 1 ? "" : "s"} skipped (auth-detected)`,
    );
  }
  if (breakdown.contentHashUnchanged > 0) {
    lines.push(
      `- ${breakdown.contentHashUnchanged} page${breakdown.contentHashUnchanged === 1 ? "" : "s"} skipped (unchanged since prior run)`,
    );
  }
  if (
    breakdown.noindex === 0 &&
    breakdown.authDetected === 0 &&
    breakdown.contentHashUnchanged === 0
  ) {
    lines.push(`- ${total} page${total === 1 ? "" : "s"} skipped`);
  }
  lines.push("");
  return lines;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function estimateHours(buckets: Bucket[]): number {
  let h = 0;
  for (const b of buckets) {
    h += EFFORT_HOURS[b.effort];
  }
  return Math.round(h * 10) / 10;
}

function formatHours(h: number): string {
  if (h <= 0) return "0 hours";
  if (h < 1) return `~${Math.round(h * 60)} minutes`;
  if (h < 10) return `~${h} hours`;
  return `~${Math.round(h)} hours`;
}

/**
 * Render an `AuditSummary` as a GitHub-flavoured markdown checklist suitable
 * for pasting into a PR description, issue body, or commit message. Findings
 * are bucketed by `(ruleId, templateSignature)` so a 47-page near-duplicate
 * cluster collapses to a single checkbox the user ticks once.
 */
export function formatFixplan(
  summary: AuditSummary,
  options?: FixplanFormatOptions,
): string {
  const lines: string[] = [];
  const date = options?.generatedDate ?? todayUtc();

  lines.push(`# pseolint fix plan`);
  lines.push("");
  const verdict = VERDICT_LABEL[summary.verdict];
  lines.push(
    `> Generated ${date}. Verdict: **${verdict}** (risk ${summary.risk}/100). ${summary.pageCount} pages audited.`,
  );
  lines.push(`>`);
  lines.push(
    `> Run \`pseolint <source> --fixplan plan.md\` after each fix round to refresh`,
  );
  lines.push(
    `> this list — \`[x]\` items are inferred from finding hashes that no longer`,
  );
  lines.push(`> appear in the new audit.`);
  lines.push("");

  // Aggregate every actionable finding into a single flat list, then bucket.
  // (`audit/*` findings are diagnostics, never appear in `summary.issues`.)
  const allFindings: RuleResult[] = [
    ...summary.issues.blockers,
    ...summary.issues.shouldFix,
    ...summary.issues.informational,
  ];

  const buckets = bucketByTemplate(allFindings);

  if (buckets.length === 0) {
    lines.push(`No findings to fix — site looks clean.`);
    const skipLines = renderSkippedSection(summary);
    if (skipLines.length > 0) {
      lines.push("");
      lines.push(...skipLines);
    }
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }

  // Group by effort, then sort within each group by count DESC, severity ASC.
  const byEffort = new Map<FixEffort | "other", Bucket[]>();
  for (const b of buckets) {
    const arr = byEffort.get(b.effort) ?? [];
    arr.push(b);
    byEffort.set(b.effort, arr);
  }
  for (const arr of byEffort.values()) {
    arr.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.worstSeverityRank - b.worstSeverityRank;
    });
  }

  for (const effort of EFFORT_ORDER) {
    const arr = byEffort.get(effort) ?? [];
    lines.push(...renderEffortSection(effort, arr));
  }

  // Skipped section.
  lines.push(...renderSkippedSection(summary));

  // Footer.
  const totalItems = buckets.length;
  const hours = estimateHours(buckets);
  lines.push(`---`);
  lines.push(
    `*Total: ${totalItems} fix-plan item${totalItems === 1 ? "" : "s"}. Estimated time-to-\`ready\`: ${formatHours(hours)}.*`,
  );

  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
