import type {
  AuditSummary,
  CategoryGrade,
  CategoryGrades,
  CategoryKey,
  FixEffort,
  RuleResult,
  Verdict,
} from "../types.js";
import { type BucketedFinding, bucketByTemplate } from "./bucket-findings.js";

export interface MarkdownFormatOptions {
  /** When true, list every finding bucketed by severity (kept for parity with other formatters; markdown always lists everything). */
  verbose?: boolean;
}

const VERDICT_GLYPH: Record<Verdict, string> = {
  ready: "✅",
  caution: "⚠️",
  concerning: "⚠️",
  critical: "🔴",
};

const VERDICT_LABEL: Record<Verdict, string> = {
  ready: "Ready",
  caution: "Caution",
  concerning: "Concerning",
  critical: "Critical",
};

const CATEGORY_LABEL: Record<Exclude<CategoryKey, "audit">, string> = {
  integrity: "Integrity",
  discoverability: "Discoverability",
  citation: "Citation",
  data: "Data",
};

function shortenUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
}

function bucketDocsLink(b: BucketedFinding): string {
  const url =
    b.representativeDocsUrl ??
    `https://pseolint.dev/rules/${b.ruleId.split("/").pop() ?? b.ruleId}`;
  return `[docs](${url})`;
}

function effortPrefix(effort: FixEffort | undefined): string {
  return effort ? `[${effort}] ` : "";
}

function renderTriageMarkdown(triage: NonNullable<AuditSummary["triage"]>): string {
  const lines: string[] = ["", "## AI Triage", ""];
  const cost =
    triage.estimatedCostUsd !== undefined ? `, est $${triage.estimatedCostUsd.toFixed(2)}` : "";
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
      lines.push(
        `| ${c.fixOrder} | ${c.label} | ${c.severity} | ${c.findingsCount} | ${c.affectedRuleIds.join(", ")} |`,
      );
    }
    lines.push("");
    for (const c of sorted) {
      lines.push(`**${c.fixOrder}. ${c.label}.** ${c.rationale}`);
      lines.push("");
    }
  }
  return lines.join("\n");
}

/**
 * Render a severity bucket. Findings are first collapsed by template
 * signature so a single template bug surfaces once with a "Fix once,
 * resolve all N" callout instead of N near-identical lines.
 *
 * Single-instance findings keep the legacy bullet format (no `### header`)
 * so simple, low-volume reports still read like a flat list.
 */
function renderBucket(label: string, items: RuleResult[]): string[] {
  const lines: string[] = [];
  if (items.length === 0) return lines;
  lines.push(`## ${label} (${items.length})`);
  lines.push("");

  const buckets = bucketByTemplate(items);
  for (const b of buckets) {
    if (b.count === 1) {
      const target = b.representativeUrl !== "<site-wide>" ? ` — ${b.representativeUrl}` : "";
      const message = b.representativeFix ?? b.representativeMessage;
      const eff = effortPrefix(b.effort);
      lines.push(`- **\`${b.ruleId}\`**${target} — ${eff}${message} ${bucketDocsLink(b)}`);
      continue;
    }

    // Multi-instance bucket: dedicated header + body block.
    const isTemplateBucket = b.templateSignature !== null;
    const eff = effortPrefix(b.effort);
    const countLabel = isTemplateBucket
      ? `× ${b.count} instances on \`${b.templateSignature}\` template`
      : `× ${b.count} affected pages`;
    lines.push(`### ${eff}\`${b.ruleId}\` ${countLabel}`);
    lines.push("");

    const moreSuffix = isTemplateBucket
      ? ` — and ${b.count - 1} more page${b.count - 1 === 1 ? "" : "s"} match${
          b.count - 1 === 1 ? "es" : ""
        } this template.`
      : ` — affecting ${b.count} pages total.`;
    lines.push(`\`${b.representativeUrl}\` ${b.representativeMessage}${moreSuffix}`);
    lines.push("");

    if (b.representativeFix) {
      const fixOnce = isTemplateBucket ? ` Fix once, resolve all ${b.count}.` : "";
      lines.push(`**Fix:** ${b.representativeFix}${fixOnce} ${bucketDocsLink(b)}`);
    } else {
      lines.push(bucketDocsLink(b));
    }
    lines.push("");
  }
  return lines;
}

function categoryRows(categories: CategoryGrades): string[] {
  const rows: string[] = [];
  const order: Array<Exclude<CategoryKey, "audit">> = [
    "integrity",
    "discoverability",
    "citation",
    "data",
  ];
  for (const key of order) {
    const cell: CategoryGrade | undefined = categories[key];
    if (!cell) continue;
    rows.push(`| ${CATEGORY_LABEL[key]} | ${cell.grade} | ${cell.issues} |`);
  }
  return rows;
}

export function formatMarkdown(
  summary: AuditSummary,
  _options?: MarkdownFormatOptions,
): string {
  const lines: string[] = [];

  lines.push(`# pseolint report`);
  lines.push("");
  lines.push(
    `**Verdict:** ${VERDICT_GLYPH[summary.verdict]} ${VERDICT_LABEL[summary.verdict]}`,
  );
  lines.push(`**Risk:** ${summary.risk} / 100 (lower is better)`);
  lines.push("");
  lines.push(`**Headline:** ${summary.headline}`);
  lines.push(`**Pages analysed:** ${summary.pageCount}`);

  if (summary.templateDetected) {
    lines.push("");
    lines.push(
      `> Template-generated content detected. Fix suggestions are tailored for template authors.`,
    );
  }

  lines.push("");
  lines.push(`## Categories`);
  lines.push("");
  lines.push(`| Category | Grade | Issues |`);
  lines.push(`|---|---|---|`);
  lines.push(...categoryRows(summary.categories));
  lines.push("");

  // Crawl diagnostics
  const crawl = summary.diagnostics?.crawlStats;
  if (crawl) {
    lines.push(
      `_Crawl: ${crawl.fetched} fetched · ${crawl.discovered} discovered · ${crawl.skipped} skipped._`,
    );
    lines.push("");
  }

  // Issue buckets
  lines.push(...renderBucket("Blockers", summary.issues.blockers));
  lines.push(...renderBucket("Should fix", summary.issues.shouldFix));
  lines.push(...renderBucket("Informational", summary.issues.informational));

  // AI Triage (if present)
  if (summary.triage) {
    lines.push(renderTriageMarkdown(summary.triage));
  }

  // Trim trailing blank lines
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.join("\n");
}

// Helper used by callers that want short URLs in fix-queue listings.
export { shortenUrl };
