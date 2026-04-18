import type { AuditSummary, FixEffort, RuleResult, Severity } from "../types.js";

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

function severityEmoji(severity: Severity): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "error":
      return "🟠";
    case "warning":
      return "🟡";
    case "info":
      return "🔵";
  }
}

function effortBadge(effort?: string): string {
  if (!effort) return "";
  return ` (**${effort} fix**)`;
}

function shortenUrl(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

function renderTriageMarkdown(triage: NonNullable<AuditSummary["triage"]>): string {
  const lines: string[] = ["", "## AI Triage", ""];
  const cost = triage.estimatedCostUsd !== undefined ? `, est $${triage.estimatedCostUsd.toFixed(2)}` : "";
  const cacheLabel = triage.cacheHit ? "cached" : "cache miss";
  lines.push(
    `> _Model: ${triage.modelUsed} (${cacheLabel}). ${triage.tokenUsage.input.toLocaleString()} in / ${triage.tokenUsage.output.toLocaleString()} out${cost}._`,
  );
  if (triage.narrative) {
    lines.push("");
    lines.push(triage.narrative);
  }
  if (triage.rootCauses.length > 0) {
    lines.push("");
    lines.push("| # | Root cause | Severity | Findings | Affected rules |");
    lines.push("|---|---|---|---|---|");
    const sorted = triage.rootCauses.slice().sort((a, b) => a.fixOrder - b.fixOrder);
    for (const c of sorted) {
      lines.push(`| ${c.fixOrder} | ${c.label} | ${c.severity} | ${c.findingsCount} | ${c.affectedRuleIds.join(", ")} |`);
    }
    lines.push("");
    for (const c of sorted) {
      lines.push(`**${c.fixOrder}. ${c.label}.** ${c.rationale}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function formatMarkdown(summary: AuditSummary): string {
  const lines: string[] = [];

  lines.push(`# pSEOlint Audit Report`);
  lines.push("");
  lines.push(`**SpamBrain Risk Score:** ${summary.score}/100`);
  lines.push(`**Pages analysed:** ${summary.pageCount}`);
  if (summary.templateDetected) {
    lines.push("");
    lines.push(`> Template-generated content detected. Fix suggestions are tailored for template authors.`);
  }
  lines.push("");

  // Category scores table
  lines.push(`## Category Scores`);
  lines.push("");
  lines.push(`| Category | Score |`);
  lines.push(`|----------|------:|`);
  for (const [name, value] of Object.entries(summary.categoryScores)) {
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(`| ${label} | ${value} |`);
  }
  lines.push("");

  // Group scores
  if (summary.groupScores && summary.groupPageCounts) {
    lines.push(`## Group Scores`);
    lines.push("");
    lines.push(`| Group | Score | Pages |`);
    lines.push(`|-------|------:|------:|`);
    for (const [name, value] of Object.entries(summary.groupScores)) {
      const count = summary.groupPageCounts[name] ?? 0;
      lines.push(`| ${name} | ${value} | ${count} |`);
    }
    lines.push("");
  }

  // AI Triage (if present)
  if (summary.triage) {
    lines.push(renderTriageMarkdown(summary.triage));
  }

  // Findings
  lines.push(`## Findings`);
  lines.push("");

  const grouped = new Map<Severity, RuleResult[]>();
  for (const sev of SEVERITY_ORDER) {
    grouped.set(sev, []);
  }
  for (const f of summary.findings) {
    grouped.get(f.severity)!.push(f);
  }

  for (const sev of SEVERITY_ORDER) {
    const items = grouped.get(sev)!;
    if (items.length === 0) continue;

    lines.push(`### ${severityEmoji(sev)} ${sev.charAt(0).toUpperCase() + sev.slice(1)} (${items.length})`);
    lines.push("");
    for (const item of items) {
      lines.push(`- **${item.ruleId}**${effortBadge(item.effort)}: ${item.message}`);
      if (item.context?.type === "cluster" && item.context.worstPairs.length > 0) {
        const p = item.context.worstPairs[0];
        lines.push(`  > Worst: ${shortenUrl(p.left)} ↔ ${shortenUrl(p.right)} (${(p.similarity * 100).toFixed(1)}%)`);
      }
      if (item.fix) {
        lines.push(`  > ${item.fix}`);
      }
      if (item.ref) {
        lines.push(`  > [Google reference](${item.ref})`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
