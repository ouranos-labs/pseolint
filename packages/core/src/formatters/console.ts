import type { AuditSummary, RuleResult, Severity } from "../types.js";

// ANSI escape codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED_BRIGHT = "\x1b[91m";
const ORANGE = "\x1b[38;5;208m";

function scoreColor(score: number): string {
  if (score <= 20) return GREEN;
  if (score <= 40) return YELLOW;
  if (score <= 60) return ORANGE;
  if (score <= 80) return RED;
  return RED + BOLD;
}

function scoreLabel(score: number): string {
  if (score <= 20) return "Safe";
  if (score <= 40) return "Caution";
  if (score <= 60) return "Risky";
  if (score <= 80) return "Dangerous";
  return "Critical";
}

function bar(score: number, width: number = 10): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

function severityColor(severity: Severity): string {
  switch (severity) {
    case "critical":
      return RED + BOLD;
    case "error":
      return RED_BRIGHT;
    case "warning":
      return YELLOW;
    case "info":
      return DIM;
  }
}

export interface ConsoleFormatOptions {
  noColor?: boolean;
}

export function formatConsole(summary: AuditSummary, options?: ConsoleFormatOptions): string {
  const strip = options?.noColor ?? false;
  const lines: string[] = [];

  // Score header
  const color = scoreColor(summary.score);
  const label = scoreLabel(summary.score);
  lines.push(
    `${BOLD}SpamBrain Risk Score:${RESET} ${color}${summary.score}/100 (${label})${RESET}`
  );
  lines.push(`Pages analysed: ${summary.pageCount}`);
  lines.push("");

  // Category scores
  lines.push(`${BOLD}Category Scores${RESET}`);
  const categories = summary.categoryScores;
  for (const [name, value] of Object.entries(categories)) {
    const catColor = scoreColor(value as number);
    const padded = name.charAt(0).toUpperCase() + name.slice(1);
    lines.push(
      `  ${padded.padEnd(10)} ${catColor}${bar(value as number)}${RESET} ${value}`
    );
  }
  lines.push("");

  // Group scores
  if (summary.groupScores && summary.groupPageCounts) {
    lines.push(`${BOLD}Group Scores${RESET}`);
    for (const [name, value] of Object.entries(summary.groupScores)) {
      const count = summary.groupPageCounts[name] ?? 0;
      const gColor = scoreColor(value);
      lines.push(`  ${name.padEnd(15)} ${gColor}${bar(value)}${RESET} ${value} (${count} pages)`);
    }
    lines.push("");
  }

  // Top issues by rule (prioritized summary)
  const ruleCounts = new Map<string, { count: number; severity: Severity }>();
  for (const f of summary.findings) {
    const existing = ruleCounts.get(f.ruleId);
    if (existing) {
      existing.count += 1;
      if (SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(existing.severity)) {
        existing.severity = f.severity;
      }
    } else {
      ruleCounts.set(f.ruleId, { count: 1, severity: f.severity });
    }
  }

  if (ruleCounts.size > 0) {
    const sorted = Array.from(ruleCounts.entries())
      .sort((a, b) => {
        const sevDiff = SEVERITY_ORDER.indexOf(a[1].severity) - SEVERITY_ORDER.indexOf(b[1].severity);
        if (sevDiff !== 0) return sevDiff;
        return b[1].count - a[1].count;
      })
      .slice(0, 5);

    lines.push(`${BOLD}Top Issues${RESET}`);
    for (let i = 0; i < sorted.length; i += 1) {
      const [ruleId, { count, severity }] = sorted[i];
      const sColor = severityColor(severity);
      const pagesLabel = count === 1 ? "1 finding" : `${count} findings`;
      lines.push(`  ${sColor}${i + 1}.${RESET} ${ruleId} — ${pagesLabel}`);
    }
    lines.push("");
  }

  // Findings grouped by severity
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

    const sevLabel = sev.toUpperCase();
    lines.push(
      `${severityColor(sev)}${sevLabel}${RESET} (${items.length})`
    );

    const showAll = sev === "critical" || sev === "error";
    const limit = showAll ? items.length : 5;
    const visible = items.slice(0, limit);

    for (const item of visible) {
      lines.push(`  ${severityColor(sev)}\u2022${RESET} [${item.ruleId}] ${item.message}`);
      if (item.fix) {
        lines.push(`    ${DIM}Fix: ${item.fix}${RESET}`);
      }
      if (item.ref) {
        lines.push(`    ${DIM}Ref: ${item.ref}${RESET}`);
      }
    }

    if (!showAll && items.length > limit) {
      lines.push(`  ${DIM}...${items.length - limit} more${RESET}`);
    }

    lines.push("");
  }

  const output = lines.join("\n");
  if (strip) {
    return output.replace(/\x1b\[[0-9;]*m/g, "");
  }
  return output;
}
