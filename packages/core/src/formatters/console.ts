import type { AuditSummary, FindingContext, FixEffort, RuleResult, Severity } from "../types.js";

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

/**
 * AEO-specific score label. AEO score is raw "damage" 0–100 — low is good.
 *   0–20  AI-Ready    pages structured for citation
 *  21–40  Partial     some citable, others vulnerable
 *  41–60  Vulnerable  most pages will be summarized away
 *  61–80  Invisible   pages offer nothing AI can't synthesize itself
 *  81–100 Ghost       actively blocked + no citable structure
 */
export function aeoScoreLabel(score: number): string {
  if (score <= 20) return "AI-Ready";
  if (score <= 40) return "Partial";
  if (score <= 60) return "Vulnerable";
  if (score <= 80) return "Invisible";
  return "Ghost";
}

function bar(score: number, width: number = 10): string {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return "\u2588".repeat(filled) + "\u2591".repeat(empty);
}

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

const EFFORT_ORDER: FixEffort[] = ["quick", "moderate", "structural"];

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

function effortLabel(effort: FixEffort): string {
  switch (effort) {
    case "quick":
      return `${GREEN}[quick fix]${RESET}`;
    case "moderate":
      return `${YELLOW}[moderate]${RESET}`;
    case "structural":
      return `${RED}[structural]${RESET}`;
  }
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname;
  } catch {
    return url;
  }
}

function renderTriageSection(triage: AuditSummary["triage"]): string {
  if (!triage) return "";
  const lines: string[] = [];
  const cacheLabel = triage.cacheHit ? "cached" : "cache miss";
  lines.push(`\n\u2500\u2500\u2500 AI Triage (${triage.modelUsed}, ${cacheLabel}) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`);
  lines.push(`Top ${triage.rootCauses.length} root causes:`);
  const sorted = triage.rootCauses.slice().sort((a, b) => a.fixOrder - b.fixOrder);
  for (const cause of sorted) {
    lines.push(`  ${cause.fixOrder}. ${cause.label} [${cause.severity}, ${cause.findingsCount} findings]`);
    for (const sentence of cause.rationale.split(/(?<=\.)\s+/)) {
      lines.push(`     ${sentence}`);
    }
  }
  if (triage.narrative) {
    lines.push("");
    lines.push(`Narrative: ${triage.narrative}`);
  }
  const cost = triage.estimatedCostUsd !== undefined ? ` \u2022 est $${triage.estimatedCostUsd.toFixed(2)}` : "";
  lines.push("");
  lines.push(
    `${triage.tokenUsage.input.toLocaleString("en-US")} input / ${triage.tokenUsage.output.toLocaleString("en-US")} output tokens${cost} \u2022 ${cacheLabel}`,
  );
  lines.push("\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  return lines.join("\n");
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

  // Template banner
  if (summary.templateDetected) {
    lines.push(
      `${DIM}Template-generated content detected. Fix suggestions are tailored for template authors.${RESET}`
    );
  }

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

  // Dedicated AEO section (AI Overview readiness)
  const aeoFindings = summary.findings.filter((f) => f.ruleId.startsWith("aeo/"));
  if (aeoFindings.length > 0) {
    const aeoScore = summary.categoryScores.aeo;
    const aeoColor = scoreColor(aeoScore);
    const aeoLabel = aeoScoreLabel(aeoScore);
    lines.push(`${BOLD}── AEO: AI Overview Readiness ───────────────${RESET}`);
    lines.push(`  Score: ${aeoColor}${aeoScore}/100 (${aeoLabel})${RESET}`);

    // Aggregate AEO findings by rule for top-line summary.
    const aeoAgg = new Map<string, { severity: Severity; pages: number; sample?: string }>();
    for (const f of aeoFindings) {
      const existing = aeoAgg.get(f.ruleId);
      if (existing) {
        existing.pages += 1;
        if (SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(existing.severity)) {
          existing.severity = f.severity;
        }
      } else {
        aeoAgg.set(f.ruleId, { severity: f.severity, pages: 1, sample: f.fix });
      }
    }

    const sorted = Array.from(aeoAgg.entries()).sort(
      (a, b) => SEVERITY_ORDER.indexOf(a[1].severity) - SEVERITY_ORDER.indexOf(b[1].severity),
    );
    for (const [ruleId, agg] of sorted) {
      const mark = agg.severity === "error" || agg.severity === "critical" ? "✖" : "⚠";
      const sColor = severityColor(agg.severity);
      lines.push(`  ${sColor}${mark}${RESET} ${ruleId}  ${agg.pages} page${agg.pages === 1 ? "" : "s"} affected.`);
    }
    lines.push("");
  }

  // AI Triage section (between summary and findings)
  const triageSection = renderTriageSection(summary.triage);
  if (triageSection) {
    lines.push(triageSection);
    lines.push("");
  }

  // Top issues by rule (prioritized summary)
  // Build a map of ruleId -> { severity, effort, clusterCount, totalPages, similarityRange }
  interface RuleAgg {
    severity: Severity;
    effort?: FixEffort;
    clusterCount: number;
    totalPages: number;
    similarityRange?: [number, number];
  }

  const ruleAgg = new Map<string, RuleAgg>();

  for (const f of summary.findings) {
    const existing = ruleAgg.get(f.ruleId);
    const isCluster = f.context?.type === "cluster";
    const clusterCtx = isCluster ? (f.context as Extract<typeof f.context, { type: "cluster" }>) : undefined;

    if (existing) {
      // Escalate severity if needed
      if (SEVERITY_ORDER.indexOf(f.severity) < SEVERITY_ORDER.indexOf(existing.severity)) {
        existing.severity = f.severity;
      }
      // Escalate effort if needed
      if (f.effort !== undefined) {
        if (existing.effort === undefined || EFFORT_ORDER.indexOf(f.effort) > EFFORT_ORDER.indexOf(existing.effort)) {
          existing.effort = f.effort;
        }
      }
      if (isCluster && clusterCtx) {
        existing.clusterCount += 1;
        existing.totalPages += clusterCtx.members.length;
        // Merge similarity range
        if (existing.similarityRange) {
          existing.similarityRange[0] = Math.min(existing.similarityRange[0], clusterCtx.similarityRange[0]);
          existing.similarityRange[1] = Math.max(existing.similarityRange[1], clusterCtx.similarityRange[1]);
        } else {
          existing.similarityRange = [...clusterCtx.similarityRange];
        }
      } else if (!isCluster) {
        existing.totalPages += 1;
      }
    } else {
      if (isCluster && clusterCtx) {
        ruleAgg.set(f.ruleId, {
          severity: f.severity,
          effort: f.effort,
          clusterCount: 1,
          totalPages: clusterCtx.members.length,
          similarityRange: [...clusterCtx.similarityRange],
        });
      } else {
        ruleAgg.set(f.ruleId, {
          severity: f.severity,
          effort: f.effort,
          clusterCount: 0,
          totalPages: 1,
        });
      }
    }
  }

  if (ruleAgg.size > 0) {
    const sorted = Array.from(ruleAgg.entries())
      .sort((a, b) => {
        const sevDiff = SEVERITY_ORDER.indexOf(a[1].severity) - SEVERITY_ORDER.indexOf(b[1].severity);
        if (sevDiff !== 0) return sevDiff;
        // Within same severity, sort effort ascending (quick wins first)
        const aEffort = a[1].effort ? EFFORT_ORDER.indexOf(a[1].effort) : EFFORT_ORDER.length;
        const bEffort = b[1].effort ? EFFORT_ORDER.indexOf(b[1].effort) : EFFORT_ORDER.length;
        return aEffort - bEffort;
      })
      .slice(0, 7);

    lines.push(`${BOLD}Top Issues${RESET}`);
    for (let i = 0; i < sorted.length; i += 1) {
      const [ruleId, agg] = sorted[i];
      const sColor = severityColor(agg.severity);
      let detail: string;
      if (agg.clusterCount > 0 && agg.similarityRange) {
        const simMin = Math.round(agg.similarityRange[0] * 100);
        const simMax = Math.round(agg.similarityRange[1] * 100);
        detail = `${agg.clusterCount} cluster${agg.clusterCount !== 1 ? "s" : ""} (${agg.totalPages} pages, ${simMin}\u2013${simMax}% similar). Structural fix.`;
      } else {
        const effortStr = agg.effort
          ? ` ${agg.effort.charAt(0).toUpperCase() + agg.effort.slice(1)} fix.`
          : "";
        detail = `${agg.totalPages} page${agg.totalPages !== 1 ? "s" : ""}.${effortStr}`;
      }
      lines.push(`  ${sColor}${i + 1}.${RESET} ${ruleId} \u2014 ${detail}`);
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
      // Cluster worst pair — show before fix so user sees the problem first
      if (item.context?.type === "cluster") {
        const clusterCtx = item.context as Extract<FindingContext, { type: "cluster" }>;
        if (clusterCtx.worstPairs.length > 0) {
          const worst = clusterCtx.worstPairs[0];
          const leftShort = shortenUrl(worst.left);
          const rightShort = shortenUrl(worst.right);
          const simPct = (worst.similarity * 100).toFixed(1);
          lines.push(`    ${DIM}Worst: ${leftShort} \u2194 ${rightShort} (${simPct}%)${RESET}`);
        }
      }
      if (item.fix) {
        lines.push(`    ${DIM}Fix: ${item.fix}${RESET}`);
      }
      if (item.ref) {
        lines.push(`    ${DIM}Ref: ${item.ref}${RESET}`);
      }
      if (item.effort) {
        lines.push(`    ${effortLabel(item.effort)}`);
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
