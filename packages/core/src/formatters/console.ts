import type {
  AuditSummary,
  CategoryGrade,
  CategoryGrades,
  CategoryKey,
  FixEffort,
  Grade,
  RuleResult,
  Verdict,
} from "../types.js";
import type { SiteClassification, SiteType } from "../site-classifier.js";
import { type BucketedFinding, bucketByTemplate } from "./bucket-findings.js";

/**
 * Total rule count surfaced in the "pass --strict to run all N" hint.
 * This MUST match the surviving rule count documented in v0.4 §4.3 (32 rules).
 * If we add or drop rules in v0.5+, bump this constant.
 */
const TOTAL_V04_RULE_COUNT = 32;

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

/** Effort-prefix glyph used by `[quick]`, `[moderate]`, `[structural]` rule lines. */
function effortPrefix(effort: FixEffort | undefined): string {
  if (!effort) return "";
  return `[${effort}] `;
}

/** Mimic the legacy `docsLine(RuleResult)` API for buckets. */
function bucketDocsLine(b: BucketedFinding): string {
  if (b.representativeDocsUrl) {
    return b.representativeDocsUrl.replace(/^https?:\/\//, "");
  }
  return `pseolint.dev/rules/${b.ruleId.split("/").pop() ?? b.ruleId}`;
}

/**
 * Render a single bucket as one or more output lines. Single-instance buckets
 * keep their pre-bucketing format (no "× 1" suffix). Multi-instance buckets
 * get a `× N instances on TEMPLATE` headline plus a "Fix once, resolve all N"
 * callout when they share a template signature.
 */
function renderBucketLines(b: BucketedFinding, index: number): string[] {
  const out: string[] = [];
  const eff = effortPrefix(b.effort);
  const target = b.representativeUrl !== "<site-wide>" ? shortenUrl(b.representativeUrl) : "";

  if (b.count === 1) {
    // Single finding: keep the legacy headline format.
    const targetPart = target ? `${target} ` : "";
    const headline = `${eff}${targetPart}${b.representativeMessage}`.trim();
    const fix = b.representativeFix ? `  → ${b.representativeFix}` : "";
    out.push(`  ${index + 1}. ${headline}${fix}`);
    out.push(`     ${DIM}${bucketDocsLine(b)}${RESET}`);
    return out;
  }

  // Multi-instance: bucket headline + example + fix-once callout.
  const isTemplateBucket = b.templateSignature !== null;
  const countLabel = isTemplateBucket
    ? `× ${b.count} instances on ${b.templateSignature} template`
    : `× ${b.count} affected pages`;
  out.push(`  ${index + 1}. ${eff}${b.ruleId} ${countLabel}`);

  const targetPart = target ? `${target} ` : "";
  out.push(`     e.g. ${targetPart}${b.representativeMessage}`.trimEnd());

  if (b.representativeFix) {
    out.push(`     → ${b.representativeFix}`);
  }
  if (isTemplateBucket) {
    out.push(`     ${DIM}Fix once, resolve all ${b.count}.${RESET}`);
  }
  out.push(`     ${DIM}${bucketDocsLine(b)}${RESET}`);
  return out;
}

/**
 * Top-fixes section. Buckets blockers first, then should-fix, by template
 * signature so duplicate findings collapse. Limits to 5 buckets — anything
 * past that is verbose-mode territory.
 */
function renderTopFixes(blockers: RuleResult[], shouldFix: RuleResult[]): string[] {
  const lines: string[] = [];
  const bucketedBlockers = bucketByTemplate(blockers);
  const bucketedShould = bucketByTemplate(shouldFix);
  const ranked = [...bucketedBlockers, ...bucketedShould].slice(0, 5);
  if (ranked.length === 0) return lines;

  for (let i = 0; i < ranked.length; i += 1) {
    lines.push(...renderBucketLines(ranked[i], i));
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

/**
 * Render the v0.4 §4.11 classification banner.
 *
 *   ✓ Site type: small-marketing (confidence 92%, 23 URLs, no template cluster)
 *   ✓ Suppressed 4 pSEO-only rules — pass --strict to run all 32
 *
 * For programmatic-directory:
 *   ✓ Site type: programmatic-directory (confidence 90%, 12,453 URLs, /:state/:city/:service covers 90%)
 *     All 32 rules applied.
 *
 * For unclear:
 *   ✓ Site type: unclear — all 32 rules applied.
 */
function classificationLines(c: SiteClassification | undefined): string[] {
  if (!c) return [];
  const lines: string[] = [];
  const urlCount = (c.signals.find((s) => s.kind === "sitemap-url-count") as
    | { kind: "sitemap-url-count"; value: number }
    | undefined)?.value;
  const cluster = c.signals.find((s) => s.kind === "url-pattern-cluster-coverage") as
    | { kind: "url-pattern-cluster-coverage"; topTemplate: string; pages: number; ratio: number }
    | undefined;
  const confPct = Math.round(c.confidence * 100);
  const urlsLabel = urlCount !== undefined ? `${urlCount.toLocaleString("en-US")} URLs` : "";

  const fmtType = (t: SiteType): string => t;

  if (c.type === "unclear") {
    lines.push(
      `${GREEN}✓${RESET} Site type: ${fmtType(c.type)} — all ${TOTAL_V04_RULE_COUNT} rules applied.`,
    );
    return lines;
  }

  const clusterPart = cluster
    ? cluster.ratio >= 0.4
      ? `${cluster.topTemplate} covers ${Math.round(cluster.ratio * 100)}%`
      : "no template cluster"
    : "no template cluster";

  const detailParts = [`confidence ${confPct}%`, urlsLabel, clusterPart].filter(Boolean);
  lines.push(
    `${GREEN}✓${RESET} Site type: ${fmtType(c.type)} (${detailParts.join(", ")})`,
  );

  if (c.suppressedRules.length > 0) {
    lines.push(
      `${GREEN}✓${RESET} Suppressed ${c.suppressedRules.length} pSEO-only rule${c.suppressedRules.length === 1 ? "" : "s"} — pass --strict to run all ${TOTAL_V04_RULE_COUNT}`,
    );
  } else {
    lines.push(`  All ${TOTAL_V04_RULE_COUNT} rules applied.`);
  }
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

  // ── Site classification banner (v0.4 §4.11) ────────────────────────
  // Renders BEFORE the verdict so the operator sees what kind of site we
  // think we're auditing and which rules were suppressed (if any).
  lines.push(...classificationLines(summary.siteClassification));

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
