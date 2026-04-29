import type {
  AuditSummary,
  CategoryGrade,
  CategoryGrades,
  CategoryKey,
  Grade,
  RuleResult,
  Verdict,
} from "../types.js";

// ANSI escape codes
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED_BRIGHT = "\x1b[91m";
const ORANGE = "\x1b[38;5;208m";
const MAGENTA = "\x1b[35m";

// ── Verdict / grade colour helpers ──────────────────────────────────────
function verdictColor(v: Verdict): string {
  switch (v) {
    case "ready":
      return GREEN;
    case "caution":
      return YELLOW;
    case "concerning":
      return MAGENTA;
    case "critical":
      return RED + BOLD;
  }
}

function verdictGlyph(v: Verdict): string {
  switch (v) {
    case "ready":
      return "✓"; // ✓
    case "caution":
      return "⚠"; // ⚠
    case "concerning":
      return "⚠"; // ⚠
    case "critical":
      return "✖"; // ✖
  }
}

function gradeColor(g: Grade): string {
  switch (g) {
    case "A":
    case "B":
      return GREEN;
    case "C":
      return YELLOW;
    case "D":
      return ORANGE;
    case "F":
      return RED + BOLD;
  }
}

function shortenUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return url;
  }
}

function docsLine(f: RuleResult): string {
  if (f.docsUrl) {
    return f.docsUrl.replace(/^https?:\/\//, "");
  }
  return `pseolint.dev/rules/${f.ruleId.split("/").pop() ?? f.ruleId}`;
}

function renderTriageSection(triage: AuditSummary["triage"]): string {
  if (!triage) return "";
  const lines: string[] = [];
  const cacheLabel = triage.cacheHit ? "cached" : "cache miss";
  lines.push(
    `\n─── AI Triage (${triage.modelUsed}, ${cacheLabel}) ─────────────`,
  );
  lines.push(`Top ${triage.rootCauses.length} root causes:`);
  const sorted = triage.rootCauses.slice().sort((a, b) => a.fixOrder - b.fixOrder);
  for (const cause of sorted) {
    lines.push(
      `  ${cause.fixOrder}. ${cause.label} [${cause.severity}, ${cause.findingsCount} findings]`,
    );
    for (const sentence of cause.rationale.split(/(?<=\.)\s+/)) {
      lines.push(`     ${sentence}`);
    }
  }
  if (triage.narrative) {
    lines.push("");
    lines.push(`Narrative: ${triage.narrative}`);
  }
  const cost =
    triage.estimatedCostUsd !== undefined ? ` • est $${triage.estimatedCostUsd.toFixed(2)}` : "";
  lines.push("");
  lines.push(
    `${triage.tokenUsage.input.toLocaleString("en-US")} input / ${triage.tokenUsage.output.toLocaleString("en-US")} output tokens${cost} • ${cacheLabel}`,
  );
  lines.push(
    "───────────────────────────────────────────────────────",
  );
  return lines.join("\n");
}

export interface ConsoleFormatOptions {
  noColor?: boolean;
  /** When true, list every finding bucketed by severity instead of just top fixes. */
  verbose?: boolean;
}

/** Aggregate findings sharing the same ruleId; rank by page-count then severity. */
interface RuleAgg {
  ruleId: string;
  count: number;
  representative: RuleResult;
}

function aggregateByRule(findings: RuleResult[]): RuleAgg[] {
  const map = new Map<string, RuleAgg>();
  for (const f of findings) {
    const existing = map.get(f.ruleId);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(f.ruleId, { ruleId: f.ruleId, count: 1, representative: f });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.ruleId.localeCompare(b.ruleId);
  });
}

function renderTopFixes(blockers: RuleResult[], shouldFix: RuleResult[]): string[] {
  // Spec: top fixes by impact = blockers first, then should-fix; aggregated by rule.
  const lines: string[] = [];
  const aggBlockers = aggregateByRule(blockers);
  const aggShould = aggregateByRule(shouldFix);
  const ranked = [...aggBlockers, ...aggShould].slice(0, 5);
  if (ranked.length === 0) return lines;

  for (let i = 0; i < ranked.length; i += 1) {
    const agg = ranked[i];
    const r = agg.representative;
    const target = r.pageUrl ? shortenUrl(r.pageUrl) : "";
    const targetPart = target ? `${target} ` : "";
    const countLabel = agg.count === 1 ? "" : ` (${agg.count} pages)`;
    const headline = `${targetPart}${r.message}${countLabel}`.trim();
    const fix = r.fix ? `  → ${r.fix}` : "";
    lines.push(`  ${i + 1}. ${headline}${fix}`);
    lines.push(`     ${DIM}${docsLine(r)}${RESET}`);
  }
  return lines;
}

function renderBucketVerbose(label: string, items: RuleResult[]): string[] {
  const lines: string[] = [];
  if (items.length === 0) return lines;
  lines.push(`${BOLD}${label} (${items.length})${RESET}`);
  for (const f of items) {
    const ruleCol = f.ruleId.padEnd(28);
    const urlCol = (shortenUrl(f.pageUrl) || "—").padEnd(28);
    const fixCol = f.fix ?? f.message;
    lines.push(`  ${ruleCol} ${DIM}${urlCol}${RESET} ${fixCol}`);
  }
  lines.push("");
  return lines;
}

function categoryLine(categories: CategoryGrades): string {
  // Display the four user-facing buckets — `audit` is engine-internal and weight-0.
  const order: { key: Exclude<CategoryKey, "audit">; label: string }[] = [
    { key: "integrity", label: "Integrity" },
    { key: "discoverability", label: "Discoverability" },
    { key: "citation", label: "Citation" },
    { key: "data", label: "Data" },
  ];
  return order
    .map(({ key, label }) => {
      const cell: CategoryGrade | undefined = categories[key];
      if (!cell) return `${label} ?`;
      return `${label} ${gradeColor(cell.grade)}${cell.grade}${RESET}`;
    })
    .join(" · ");
}

export function formatConsole(summary: AuditSummary, options?: ConsoleFormatOptions): string {
  const strip = options?.noColor ?? false;
  const verbose = options?.verbose ?? false;
  const lines: string[] = [];

  // ── Crawl line ──────────────────────────────────────────────────────
  const crawl = summary.diagnostics?.crawlStats;
  if (crawl) {
    const skippedPart = crawl.skipped > 0 ? ` (${crawl.skipped} utility routes skipped)` : "";
    lines.push(
      `${GREEN}✓${RESET} Discovered ${crawl.fetched} content page${crawl.fetched === 1 ? "" : "s"}${skippedPart}`,
    );
  } else {
    lines.push(
      `${GREEN}✓${RESET} Audited ${summary.pageCount} page${summary.pageCount === 1 ? "" : "s"}`,
    );
  }
  lines.push("");

  // ── Verdict + grade strip ───────────────────────────────────────────
  const vColor = verdictColor(summary.verdict);
  const vGlyph = verdictGlyph(summary.verdict);
  lines.push(
    `${BOLD}Verdict:${RESET} ${vColor}${summary.verdict.toUpperCase()} ${vGlyph}${RESET}`,
  );
  lines.push(categoryLine(summary.categories));

  // ── Template banner ────────────────────────────────────────────────
  if (summary.templateDetected) {
    lines.push("");
    lines.push(
      `${DIM}Template-generated content detected. Fix suggestions are tailored for template authors.${RESET}`,
    );
  }

  lines.push("");

  // ── Headline + top fixes ───────────────────────────────────────────
  const issues = summary.issues;
  const blockerCount = issues.blockers.length;
  const shouldFixCount = issues.shouldFix.length;

  if (blockerCount === 0 && shouldFixCount === 0 && issues.informational.length === 0) {
    lines.push(`${GREEN}No issues detected.${RESET}`);
  } else {
    lines.push(`${summary.headline} — top fixes by impact:`);
    const top = renderTopFixes(issues.blockers, issues.shouldFix);
    lines.push(...top);
  }

  // ── Verbose bucket dump ─────────────────────────────────────────────
  if (verbose) {
    lines.push("");
    lines.push(...renderBucketVerbose("BLOCKERS", issues.blockers));
    lines.push(...renderBucketVerbose("SHOULD-FIX", issues.shouldFix));
    lines.push(...renderBucketVerbose("INFORMATIONAL", issues.informational));
  } else if (blockerCount + shouldFixCount > 0) {
    lines.push("");
    lines.push(`${DIM}Run \`pseolint --explain\` for the full list.${RESET}`);
  }

  // ── AI triage section (unchanged shape) ─────────────────────────────
  const triageSection = renderTriageSection(summary.triage);
  if (triageSection) {
    lines.push(triageSection);
  }

  const output = lines.join("\n");
  if (strip) {
    return output.replace(/\x1b\[[0-9;]*m/g, "");
  }
  return output;
}

/**
 * Legacy helper retained for back-compat with existing tests/imports.
 * AEO score band → human label. Low score = AI-Ready, high = Ghost.
 */
export function aeoScoreLabel(score: number): string {
  if (score <= 20) return "AI-Ready";
  if (score <= 40) return "Partial";
  if (score <= 60) return "Vulnerable";
  if (score <= 80) return "Invisible";
  return "Ghost";
}
