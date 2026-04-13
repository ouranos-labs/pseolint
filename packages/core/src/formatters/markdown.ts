import type { AuditSummary, RuleResult, Severity } from "../types.js";

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

export function formatMarkdown(summary: AuditSummary): string {
  const lines: string[] = [];

  lines.push(`# pSEOlint Audit Report`);
  lines.push("");
  lines.push(`**SpamBrain Risk Score:** ${summary.score}/100`);
  lines.push(`**Pages analysed:** ${summary.pageCount}`);
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
      lines.push(`- **${item.ruleId}**: ${item.message}`);
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
