import type {
  AuditSummary,
  CategoryGrade,
  CategoryGrades,
  CategoryKey,
  Confidence,
  FixEffort,
  RuleResult,
  Verdict,
} from "../types.js";
import type { SiteClassification } from "../site-classifier.js";
import { type BucketedFinding, bucketByTemplate } from "./bucket-findings.js";
import {
  renderTemplateCardsMarkdown,
  shouldRenderTemplateCards,
} from "./template-cards.js";

export interface MarkdownFormatOptions {
  /** When true, list every finding bucketed by severity (kept for parity with other formatters; markdown always lists everything). */
  verbose?: boolean;
  /**
   * v0.5.11 — when true (default), render per-template cards above the
   * per-URL findings list when ≥2 templates were detected.
   */
  perTemplate?: boolean;
  /** v0.5.11 — filter per-URL findings to this template signature. Silently ignored on no match. */
  filterTemplate?: string;
  /** v0.5.11 — skip per-template view; render flat per-URL list. */
  legacyFlat?: boolean;
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

/** v0.4.3 — caveat suffix for low-confidence findings, rendered inline. */
function confidenceCaveat(c: Confidence | undefined): string | null {
  if (c === "low") return "low confidence — known false-positive risk on this site type";
  if (c === "speculative") return "speculative — heuristic match; verify before acting";
  return null;
}

/** v0.4.3 — "Audited as <type>" line shown under the verdict header. */
function auditedAsLine(c: SiteClassification | undefined): string | null {
  if (!c) return null;
  const confPct = Math.round(c.confidence * 100);
  const suppressed = c.suppressedRules.length;
  const suppressedPart =
    suppressed > 0
      ? ` ${suppressed} pSEO-only rule${suppressed === 1 ? "" : "s"} suppressed.`
      : "";
  return `_Audited as **${c.type}** (${confPct}% confidence).${suppressedPart}_`;
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
    const caveat = confidenceCaveat(b.representativeConfidence);
    if (b.count === 1) {
      const target = b.representativeUrl !== "<site-wide>" ? ` — ${b.representativeUrl}` : "";
      const message = b.representativeFix ?? b.representativeMessage;
      const eff = effortPrefix(b.effort);
      lines.push(`- **\`${b.ruleId}\`**${target} — ${eff}${message} ${bucketDocsLink(b)}`);
      if (caveat) lines.push(`  - _${caveat}_`);
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

    if (caveat) {
      lines.push(`> _${caveat}_`);
      lines.push("");
    }

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
  options?: MarkdownFormatOptions,
): string {
  const perTemplate = options?.perTemplate !== false; // default ON
  const legacyFlat = options?.legacyFlat ?? false;
  const filterTemplate = options?.filterTemplate;
  const lines: string[] = [];

  lines.push(`# pseolint report`);
  lines.push("");
  lines.push(
    `**Verdict:** ${VERDICT_GLYPH[summary.verdict]} ${VERDICT_LABEL[summary.verdict]}`,
  );
  // v0.4.3 — show "Audited as <type>" right under the verdict so the
  // operator knows which scoring profile produced the verdict.
  const audited = auditedAsLine(summary.siteClassification);
  if (audited) lines.push(audited);
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

  // ── Per-template cards (v0.5.11) ────────────────────────────────────
  const templates = summary.templates;
  const cardOpts = { legacyFlat: legacyFlat || !perTemplate, filterTemplate };
  if (shouldRenderTemplateCards(templates, cardOpts)) {
    const cardsBlock = renderTemplateCardsMarkdown(templates, cardOpts);
    if (cardsBlock) {
      lines.push(cardsBlock);
    }
  }

  // Resolve findings, filtered when --template is active.
  let filteredBlockers = summary.issues.blockers;
  let filteredShouldFix = summary.issues.shouldFix;
  let filteredInfo = summary.issues.informational;
  if (filterTemplate && Array.isArray(templates)) {
    const matchedTemplate = templates.find((t) => t.signature === filterTemplate);
    if (matchedTemplate) {
      const urlSet = new Set(matchedTemplate.auditedUrls);
      const keep = (f: RuleResult): boolean => !f.pageUrl || urlSet.has(f.pageUrl);
      filteredBlockers = summary.issues.blockers.filter(keep);
      filteredShouldFix = summary.issues.shouldFix.filter(keep);
      filteredInfo = summary.issues.informational.filter(keep);
    }
  }

  // Issue buckets — blockers and should-fix render inline because they're
  // the actionable items. Informational findings collapse behind a
  // <details> on by default — they're often high-volume on catalog and
  // template-driven sites (118 info findings on Webflow's templates
  // gallery, 134 on Ramp's spend-management directory) where surfacing
  // every entry as a fresh markdown bullet drowns the actionable signal.
  // The user can expand the block to see all entries, or run with
  // `--explain` (console) for the full dump.
  lines.push(...renderBucket("Blockers", filteredBlockers));
  lines.push(...renderBucket("Should fix", filteredShouldFix));
  if (filteredInfo.length > 0) {
    const infoLines = renderBucket("Informational", filteredInfo);
    lines.push(`<details>`);
    lines.push(`<summary><strong>Informational (${filteredInfo.length})</strong> — low-confidence or context-dependent findings. Click to expand.</summary>`);
    lines.push("");
    // Strip the duplicate ## header that renderBucket added; the <summary>
    // already labels the section.
    lines.push(...infoLines.slice(2));
    lines.push("");
    lines.push(`</details>`);
    lines.push("");
  }

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
