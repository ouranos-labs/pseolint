import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { auditSource, formatConsole, formatJson, orchestrate, SCORED_CATEGORY_KEYS } from "@pseolint/core";
import { RULE_KNOWLEDGE } from "./okf-knowledge.js";
import type { AuditOptions, AuditSummary, FixManifest, FixEffort, ManifestValidationReport, RuleResult } from "@pseolint/core";

/**
 * MCP SDK 1.29's `inputSchema`/`outputSchema` are typed as
 * `ZodRawShapeCompat = Record<string, z3.ZodTypeAny | z4.$ZodType>` via a
 * zod-compat shim. zod 4.4.x's high-level `ZodString` / `ZodNumber` extend
 * `core.$ZodType` from `zod/v4/core`, so they satisfy the runtime contract —
 * but TypeScript 6 strict mode infers the union's z3 branch first and reports
 * a structural mismatch against z3 internals (`_type`, `_parse`, etc.) that v4
 * schemas don't have.
 *
 * We name the SDK's expected shape via `zodShape<T>()`: it accepts a
 * Record<string, ZodTypeAny> at the call site (so each tool's schema stays
 * authored in plain zod 4 syntax) and returns a value typed as the SDK's
 * `ZodRawShapeCompat`. One cast, one place, no runtime cost. Used for both
 * `inputSchema` and `outputSchema`. Handler args keep their explicit types
 * below to compensate for the lost inference.
 */
function zodShape<T extends Record<string, z.ZodTypeAny>>(shape: T): T & ZodRawShapeCompat {
  return shape as unknown as T & ZodRawShapeCompat;
}

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** Parse a positive-integer env override, falling back to `fallback`. */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Default page-sample cap for MCP audits (keeps AI-host runs fast). Override with PSEOLINT_MCP_SAMPLE_CAP. */
const MCP_SAMPLE_CAP = envInt("PSEOLINT_MCP_SAMPLE_CAP", 50);

/**
 * Size cap on *human-readable* console/summary text. NOT applied to JSON via
 * string-slicing (that would corrupt it) — the JSON path is bounded by data
 * instead (see JSON_TEXT_CHAR_CAP). Counts UTF-16 code units (a loose proxy for
 * tokens). Override with PSEOLINT_MCP_CHAR_LIMIT.
 */
const CHARACTER_LIMIT = envInt("PSEOLINT_MCP_CHAR_LIMIT", 25_000);

/**
 * When `formatJson` output exceeds this, the text content is replaced with a
 * valid-JSON envelope (truncation marker + the structured summary + a CLI
 * pointer) rather than left unbounded. structuredContent still carries the
 * curated payload; the CLI carries the full manifest. Override with
 * PSEOLINT_MCP_JSON_CHAR_CAP.
 */
const JSON_TEXT_CHAR_CAP = envInt("PSEOLINT_MCP_JSON_CHAR_CAP", 100_000);

/**
 * Max findings embedded in `structuredContent.findings`. Distinct from
 * MCP_SAMPLE_CAP (which caps *pages*): this caps *findings* in the structured
 * payload. `findingCount` always reports the true total and `findingsTruncated`
 * flags when the array was shortened.
 */
const STRUCTURED_FINDINGS_CAP = envInt("PSEOLINT_MCP_FINDINGS_CAP", 100);

/** How many ranked rule drivers `explain_score` returns. */
const TOP_DRIVERS_LIMIT = 10;

/**
 * MCP-surface safety ceilings for the orchestrator's budget args. Core imposes
 * NO hard upper bound (DEFAULT_BUDGET is $5 / 100 calls / 300s and any override
 * is accepted unclamped); but in an MCP host the LLM picks these values, so we
 * cap them defensively well above the conservative MCP defaults ($2/60/180):
 * ~10x cost, ~5x calls, ~3x wall. These are policy, not a core constraint.
 */
const MAX_ORCH_COST_USD = 50;
const MAX_ORCH_TOOL_CALLS = 500;
const MAX_ORCH_WALL_SECONDS = 900;

/** Upper bound on an explicit page-sample override (the param exists to override MCP_SAMPLE_CAP). */
const MAX_SAMPLE_SIZE = 500;

/** The scored categories surfaced to clients, sourced from core (excludes the weight-0 `audit` bucket). */
const SCORED_CATEGORIES: ReadonlySet<string> = new Set(SCORED_CATEGORY_KEYS);

function cliHint(target: string): string {
  return `Use the CLI for the full report: npx pseolint ${target}`;
}

/**
 * Truncate human-readable text to CHARACTER_LIMIT, appending a pointer to the
 * full report. Only ever call this on prose/console output — never on JSON.
 */
function truncateText(text: string, hint: string): { text: string; truncated: boolean } {
  if (text.length <= CHARACTER_LIMIT) return { text, truncated: false };
  return {
    text: `${text.slice(0, CHARACTER_LIMIT)}\n\n…[truncated ${text.length - CHARACTER_LIMIT} characters]. ${hint}`,
    truncated: true,
  };
}

function friendlyError(err: unknown, source: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("fetch") || msg.includes("ECONNREFUSED")) {
    return `Could not reach ${source}. If this is a local dev server, make sure it is running. Original error: ${msg}`;
  }
  if (msg.includes("Unable to access source")) {
    return `Directory not found: ${source}. Check the path exists and is readable.`;
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return `Request to ${source} timed out. The site may be slow or unreachable. Try increasing the timeout or using sampleSize to audit fewer pages.`;
  }
  return `Audit failed for ${source}: ${msg}`;
}

/**
 * v0.4: verdict ladder replaces the old numeric score-label.
 * Risk values are still 0–100 (low=good); verdict is the human-readable layer.
 */
function verdictLabel(verdict: AuditSummary["verdict"]): string {
  switch (verdict) {
    case "ready":       return "Ready";
    case "caution":     return "Caution";
    case "concerning":  return "Concerning";
    case "critical":    return "Critical";
  }
}

function flattenIssues(summary: AuditSummary): RuleResult[] {
  return [
    ...summary.issues.blockers,
    ...summary.issues.shouldFix,
    ...summary.issues.informational,
  ];
}

// --- Shared structured-output schemas (modern SDK pattern) ----------------
// These mirror the curated payloads built by the handlers below. structuredContent
// is validated against these by the SDK, so the schemas and the payload builders
// must stay in lockstep.

const VERDICT_ENUM = z.enum(["ready", "caution", "concerning", "critical"]);

const CATEGORY_GRADES_SCHEMA = z.record(
  z.string(),
  z.object({ grade: z.string(), issues: z.number() }),
);

const FINDING_SCHEMA = z.object({
  ruleId: z.string(),
  severity: z.string(),
  message: z.string(),
  fix: z.string().optional(),
  effort: z.string().optional(),
  pageUrl: z.string().optional(),
});

const TEMPLATE_SCHEMA = z.object({
  signature: z.string(),
  totalUrls: z.number(),
  auditedUrlCount: z.number(),
  verdict: z.string(),
  risk: z.number(),
  uniformityScore: z.number().optional(),
  topDriver: z.object({ ruleId: z.string(), fireRate: z.number() }).nullable().optional(),
});

const TOP_RULE_SCHEMA = z.object({
  ruleId: z.string(),
  count: z.number(),
  effort: z.string().optional(),
  fix: z.string().optional(),
});

/** Only the four scored categories, as advertised in the tool descriptions. */
function categoryGrades(summary: AuditSummary): Record<string, { grade: string; issues: number }> {
  return Object.fromEntries(
    Object.entries(summary.categories)
      .filter(([k]) => SCORED_CATEGORIES.has(k))
      .map(([k, v]) => [k, { grade: v.grade, issues: v.issues }]),
  );
}

function toFinding(f: RuleResult) {
  return {
    ruleId: f.ruleId,
    severity: f.severity,
    message: f.message,
    ...(f.fix ? { fix: f.fix } : {}),
    ...(f.effort ? { effort: f.effort } : {}),
    ...(f.pageUrl ? { pageUrl: f.pageUrl } : {}),
  };
}

function toTemplates(summary: AuditSummary) {
  return summary.templates.map((t) => ({
    signature: t.signature,
    totalUrls: t.totalUrls,
    auditedUrlCount: t.auditedUrls.length,
    verdict: t.verdict,
    risk: t.risk,
    uniformityScore: t.variance.uniformityScore,
    topDriver: t.variance.topDriver,
  }));
}

/** Rule-id → finding-count, computed once per audit. */
function ruleCounts(findings: RuleResult[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.ruleId, (counts.get(f.ruleId) ?? 0) + 1);
  return counts;
}

interface RuleDriver {
  ruleId: string;
  count: number;
  finding: RuleResult | undefined;
}

// Fix-effort sort order, mirroring core's FixEffort union. A missing effort is
// treated as "moderate" (preserves prior intent); an UNRECOGNISED value sorts
// last rather than first — `indexOf` would otherwise return -1 and float
// unknown efforts above "quick".
const EFFORT_ORDER: readonly FixEffort[] = ["quick", "moderate", "structural"];

function effortRank(effort: string | undefined): number {
  const i = EFFORT_ORDER.indexOf((effort ?? "moderate") as FixEffort);
  return i === -1 ? EFFORT_ORDER.length : i;
}

/** Rank rules by fix effort (quick first), then by finding count. */
function topDrivers(findings: RuleResult[], counts: Map<string, number>, limit: number): RuleDriver[] {
  return Array.from(counts.entries())
    .map(([ruleId, count]) => ({ ruleId, count, finding: findings.find((f) => f.ruleId === ruleId) }))
    .sort((a, b) => {
      const ea = effortRank(a.finding?.effort);
      const eb = effortRank(b.finding?.effort);
      if (ea !== eb) return ea - eb;
      return b.count - a.count;
    })
    .slice(0, limit);
}

/** Build the prioritized human-readable explanation from a precomputed driver list. */
function buildExplanation(summary: AuditSummary, threshold: number, drivers: RuleDriver[]): string {
  const lines: string[] = [];
  const label = verdictLabel(summary.verdict);
  const passFail = summary.risk >= threshold ? "FAIL" : "PASS";

  lines.push(`pseolint Verdict: ${label} (risk ${summary.risk}/100, lower=better) — ${passFail} at threshold ${threshold}`);
  lines.push(`Pages analysed: ${summary.pageCount}`);

  if (summary.templateDetected) {
    lines.push("");
    lines.push("Template-generated content detected. Fix suggestions are tailored for template authors.");
  }

  if (summary.siteClassification) {
    const sc = summary.siteClassification;
    lines.push("");
    lines.push(`Site type: ${sc.type} (confidence ${(sc.confidence * 100).toFixed(0)}%).`);
    if (sc.suppressedRules.length > 0) {
      lines.push(`Suppressed ${sc.suppressedRules.length} rule${sc.suppressedRules.length === 1 ? "" : "s"} not applicable to this site type.`);
    }
  }

  lines.push("");
  lines.push("Category breakdown:");
  for (const [cat, info] of Object.entries(summary.categories)) {
    if (!SCORED_CATEGORIES.has(cat)) continue;
    const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
    lines.push(`  ${catLabel}: ${info.grade} (${info.issues} issue${info.issues === 1 ? "" : "s"})`);
  }

  if (drivers.length > 0) {
    lines.push("");
    lines.push("What's driving the verdict (fix in this order):");
    for (const { ruleId, count, finding } of drivers) {
      const effortTag = finding?.effort ? `[${finding.effort}] ` : "";
      lines.push(`  ${effortTag}${ruleId}: ${count} finding${count !== 1 ? "s" : ""}`);
      if (finding?.fix) {
        lines.push(`    → ${finding.fix}`);
      }
    }
  }

  // v0.5.11 — surface per-template breakdown when present
  if (summary.templates && summary.templates.length >= 2) {
    lines.push("");
    lines.push("Per-template breakdown:");
    for (const t of summary.templates) {
      const td = t.variance.topDriver;
      const driverPart = td
        ? ` (${Math.round(td.fireRate * t.auditedUrls.length)}/${t.auditedUrls.length} fail ${td.ruleId})`
        : "";
      lines.push(`  ${t.signature}: ${t.verdict} — risk ${t.risk}${driverPart}`);
    }
  }

  lines.push("");
  if (summary.risk >= threshold) {
    lines.push(`Risk ${summary.risk} exceeds threshold ${threshold}. Focus on quick fixes first to bring risk down, then tackle structural issues.`);
  } else {
    lines.push(`Risk ${summary.risk} is below threshold ${threshold}. Site passes CI checks.`);
  }

  return lines.join("\n");
}

/**
 * Rules that operate on the page corpus (cross-page) rather than per-URL.
 * Used to filter check_page_technical output to per-page findings only.
 *
 * Updated for v0.4: dropped rules removed (cannibal/title-overlap,
 * cannibal/keyword-collision, content/heading-uniqueness, links/hub-pages).
 */
const CROSS_PAGE_RULES = new Set([
  "spam/near-duplicate", "spam/entity-swap", "spam/boilerplate-ratio",
  "spam/template-diversity", "spam/publication-velocity", "spam/doorway-pattern",
  "spam/template-coverage", "content/unique-value",
  "content/meta-uniqueness",
  "cannibal/url-pattern",
  "links/orphan-pages", "links/dead-ends",
  "links/cluster-connectivity",
]);

/** Register the three read-only audit tools (safe for anonymous/remote use). */
export function registerReadOnlyTools(server: McpServer): void {
  server.registerTool(
    "pseolint_audit_site",
    {
      title: "Audit Site for SpamBrain Risk",
      description: "Use when a user asks to check their website for SEO issues, SpamBrain risk, duplicate content, thin pages, or before deploying a programmatic SEO site. Crawls the site, runs 40+ rules scored across 4 categories (integrity, discoverability, citation, data), and returns a verdict (ready/caution/concerning/critical) plus a numeric risk score (0-100, lower is better) with actionable findings. Pre-flight site classification suppresses pSEO-targeted rules on small marketing sites and blogs unless strict mode is set. When the audited site has ≥2 detected URL templates, the response includes a `templates` array with per-template verdicts, risk scores, category grades, variance metrics (uniformityScore, topDriver), and audited-URL counts. Both human-readable text and structured data (structuredContent) are returned. A high-risk site is NOT a tool error — check the `passed` field / `verdict`, not `isError`.",
      inputSchema: zodShape({
        source: z.string().min(1).describe("URL (e.g. http://localhost:3000) or local directory path (e.g. ./out) to audit"),
        threshold: z.number().int().min(0).max(100).optional().default(40).describe("Risk threshold — `passed` is false if risk >= this value (default: 40, semantically equivalent to 'caution' verdict)"),
        sampleSize: z.number().int().min(0).max(MAX_SAMPLE_SIZE).optional().default(0).describe(`Audit a random subset of N pages. 0 = all pages up to the MCP cap of ${MCP_SAMPLE_CAP}. Set explicitly to override the cap (up to ${MAX_SAMPLE_SIZE}).`),
        format: z.enum(["console", "json"]).optional().default("console").describe("Text-content format. Use 'json' for full machine-readable output, 'console' for a human-readable summary. structuredContent is always returned regardless."),
        authorityScore: z.number().int().min(0).max(100).optional().describe("Bring-your-own domain authority (0-100). >=80 shifts the verdict one tier lenient on established brands; <=30 shifts one tier stricter on newer/lower-authority operators. The raw risk number is never modified."),
        sampleSeed: z.number().int().optional().describe("Integer seed for deterministic stratified sampling. Same seed + same sampleSize = same audit = same verdict, run after run."),
      }),
      outputSchema: zodShape({
        verdict: VERDICT_ENUM,
        risk: z.number(),
        passed: z.boolean(),
        threshold: z.number(),
        pageCount: z.number(),
        categories: CATEGORY_GRADES_SCHEMA,
        templates: z.array(TEMPLATE_SCHEMA).optional(),
        findings: z.array(FINDING_SCHEMA).describe(`Up to ${STRUCTURED_FINDINGS_CAP} findings, severity-ordered. See findingCount for the total and findingsTruncated for whether any were dropped.`),
        findingCount: z.number(),
        findingsTruncated: z.boolean().optional().describe("True when more than the cap of findings exist and the structured array was shortened. Use json format or the CLI for the full set."),
        textTruncated: z.boolean().optional().describe("True when the text content (not the structured data) was shortened or replaced to fit the size cap."),
        truncated: z.boolean().optional().describe("True when the crawl aborted mid-run (origin degraded); coverage is partial — treat verdict/risk/pageCount as lower bounds."),
        truncatedReason: z.string().optional().describe("Why the audit was truncated."),
        schemaVersion: z.string().optional().describe("Output schema version, e.g. 2026-06-v0.6."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ source, threshold, sampleSize, format, authorityScore, sampleSeed }) => {
      try {
        // MCP audits run on user-supplied URLs inside AI-assistant environments
        // where the LLM may not vet the target. `safeMode: "saas"` flips on
        // guardSsrf (DNS-validated private-range check), tightens maxFetchBytes,
        // and keeps robots.txt honoured — see packages/core SafeMode docs.
        const options: AuditOptions = { safeMode: "saas" };
        options.sampleSize = sampleSize > 0 ? sampleSize : MCP_SAMPLE_CAP;
        if (authorityScore !== undefined) options.authorityScore = authorityScore;
        if (sampleSeed !== undefined) options.sampleSeed = sampleSeed;

        const summary = await auditSource(source, options);
        const findings = flattenIssues(summary);
        const findingsTruncated = findings.length > STRUCTURED_FINDINGS_CAP;

        // Build the structured payload first so it can also back the JSON
        // size-cap fallback below.
        const structured: Record<string, unknown> = {
          verdict: summary.verdict,
          risk: summary.risk,
          passed: summary.risk < threshold,
          threshold,
          pageCount: summary.pageCount,
          categories: categoryGrades(summary),
          ...(summary.templates.length > 0 ? { templates: toTemplates(summary) } : {}),
          findings: findings.slice(0, STRUCTURED_FINDINGS_CAP).map(toFinding),
          findingCount: findings.length,
          ...(findingsTruncated ? { findingsTruncated: true } : {}),
          ...(summary.truncated ? { truncated: true, truncatedReason: summary.truncatedReason } : {}),
          schemaVersion: summary.schemaVersion,
        };

        const isJson = format === "json";
        let text: string;
        let textTruncated = false;

        if (isJson) {
          // Bound JSON by *data*, not string-slicing (which would corrupt it).
          // Oversized payloads collapse to a valid-JSON envelope; the full set
          // lives in the CLI.
          text = formatJson(summary);
          if (text.length > JSON_TEXT_CHAR_CAP) {
            // Compact envelope: drop the (large) findings array — they remain in
            // structuredContent (capped) and the CLI carries the full set — so
            // the envelope stays small regardless of finding volume.
            const { findings: _findings, ...compact } = structured;
            text = JSON.stringify(
              { truncated: true, note: "Full JSON exceeded the MCP size cap. Use the structuredContent field for findings, or the CLI for the complete report.", summary: compact, hint: cliHint(source) },
              null, 2,
            );
            textTruncated = true;
          }
        } else {
          let consoleText = formatConsole(summary, { noColor: true });
          if (summary.truncated) {
            consoleText = `⚠ Partial audit (origin degraded): coverage is incomplete; verdict/risk are lower bounds.\n\n${consoleText}`;
          }
          if (summary.pageCount >= MCP_SAMPLE_CAP && sampleSize === 0) {
            consoleText += `\n\nNote: Results capped to ${MCP_SAMPLE_CAP} pages for performance. Run the CLI directly for a full audit: npx pseolint ${source}`;
          }
          const t = truncateText(consoleText, cliHint(source));
          text = t.text;
          textTruncated = t.truncated;
        }

        if (textTruncated) structured.textTruncated = true;

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: friendlyError(err, source) }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "pseolint_explain_score",
    {
      title: "Explain pseolint Verdict",
      description: "Use when a user wants to understand WHY their pseolint verdict is concerning/critical, what categories are failing, and what to fix first. Returns a prioritized breakdown with quick wins listed before structural fixes, plus a pass/fail verdict against the risk threshold. Both human-readable text and structured data (structuredContent) are returned. A failing threshold is reported via `passed`, not `isError`.",
      inputSchema: zodShape({
        source: z.string().min(1).describe("URL (e.g. http://localhost:3000) or local directory path (e.g. ./out) to audit"),
        threshold: z.number().int().min(0).max(100).optional().default(40).describe("Risk threshold for the pass/fail verdict (default: 40)"),
        authorityScore: z.number().int().min(0).max(100).optional().describe("Bring-your-own domain authority (0-100). >=80 shifts the verdict one tier lenient; <=30 shifts one tier stricter. Raw risk unchanged."),
        sampleSeed: z.number().int().optional().describe("Integer seed for deterministic stratified sampling. Same seed = same audit = same verdict."),
      }),
      outputSchema: zodShape({
        verdict: VERDICT_ENUM,
        risk: z.number(),
        passed: z.boolean(),
        threshold: z.number(),
        pageCount: z.number(),
        categories: CATEGORY_GRADES_SCHEMA,
        topRules: z.array(TOP_RULE_SCHEMA),
        truncated: z.boolean().optional().describe("True when the crawl aborted mid-run (origin degraded); coverage is partial — treat verdict/risk/pageCount as lower bounds."),
        truncatedReason: z.string().optional().describe("Why the audit was truncated."),
        schemaVersion: z.string().optional().describe("Output schema version, e.g. 2026-06-v0.6."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ source, threshold, authorityScore, sampleSeed }) => {
      try {
        const options: AuditOptions = { sampleSize: MCP_SAMPLE_CAP, safeMode: "saas" };
        if (authorityScore !== undefined) options.authorityScore = authorityScore;
        if (sampleSeed !== undefined) options.sampleSeed = sampleSeed;

        const summary = await auditSource(source, options);
        const findings = flattenIssues(summary);
        const drivers = topDrivers(findings, ruleCounts(findings), TOP_DRIVERS_LIMIT);

        let explanation = buildExplanation(summary, threshold, drivers);
        if (summary.truncated) {
          explanation = `⚠ Partial audit (origin degraded): coverage is incomplete; verdict/risk are lower bounds.\n\n${explanation}`;
        }
        const { text } = truncateText(explanation, cliHint(source));

        const structured = {
          verdict: summary.verdict,
          risk: summary.risk,
          passed: summary.risk < threshold,
          threshold,
          pageCount: summary.pageCount,
          categories: categoryGrades(summary),
          topRules: drivers.map(({ ruleId, count, finding }) => ({
            ruleId,
            count,
            ...(finding?.effort ? { effort: finding.effort } : {}),
            ...(finding?.fix ? { fix: finding.fix } : {}),
          })),
          ...(summary.truncated ? { truncated: true, truncatedReason: summary.truncatedReason } : {}),
          schemaVersion: summary.schemaVersion,
        };

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: friendlyError(err, source) }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "pseolint_check_page_technical",
    {
      title: "Check Single Page Technical SEO",
      description: "Use when a user asks to check a specific page URL for technical SEO issues. Checks per-page rules only: canonical tags, Open Graph tags, JSON-LD schema, robots directives, meta tags, thin content, and author signals. Does NOT check cross-page rules (duplicates, cannibalization, linking) — use pseolint_audit_site for those. Both human-readable text and structured data (structuredContent) are returned.",
      inputSchema: zodShape({
        url: z.url().describe("Full URL of the page to check (e.g. https://yoursite.com/templates/california-llc)"),
      }),
      outputSchema: zodShape({
        url: z.string(),
        issueCount: z.number(),
        findings: z.array(FINDING_SCHEMA),
        truncated: z.boolean().optional().describe("True when the crawl aborted mid-run (origin degraded); coverage is partial — treat verdict/risk/pageCount as lower bounds."),
        truncatedReason: z.string().optional().describe("Why the audit was truncated."),
        schemaVersion: z.string().optional().describe("Output schema version, e.g. 2026-06-v0.6."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ url }) => {
      try {
        const options: AuditOptions = {
          crawlDiscovery: false,
          safeMode: "saas",
        };

        const summary = await auditSource(url, options);
        const perPageFindings = flattenIssues(summary).filter((f) => !CROSS_PAGE_RULES.has(f.ruleId));

        const lines: string[] = [];
        lines.push(`Technical SEO check for ${url}`);
        lines.push("");

        if (perPageFindings.length === 0) {
          lines.push("No technical SEO issues found on this page.");
        } else {
          lines.push(`Found ${perPageFindings.length} issue${perPageFindings.length !== 1 ? "s" : ""}:`);
          lines.push("");
          for (const f of perPageFindings) {
            const effortTag = f.effort ? ` [${f.effort}]` : "";
            lines.push(`  ${f.severity.toUpperCase()}${effortTag}: ${f.message}`);
            if (f.fix) {
              lines.push(`    → ${f.fix}`);
            }
          }
        }

        lines.push("");
        lines.push("Note: This checks per-page technical rules only. For cross-page analysis (duplicates, cannibalization, linking), use pseolint_audit_site.");

        const { text } = truncateText(lines.join("\n"), cliHint(url));

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            url,
            issueCount: perPageFindings.length,
            findings: perPageFindings.map(toFinding),
            ...(summary.truncated ? { truncated: true, truncatedReason: summary.truncatedReason } : {}),
            schemaVersion: summary.schemaVersion,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: friendlyError(err, url) }],
          isError: true,
        };
      }
    }
  );
}

/** Register the AI-orchestrated audit tool (costs money; gate behind auth when remote). */
export function registerOrchestrateTool(server: McpServer): void {
  server.registerTool(
    "pseolint_orchestrate_audit",
    {
      title: "Orchestrate AI-Native pSEO Audit",
      description:
        "Use when a user wants concrete, paste-able fixes (rewritten H1s, JSON-LD blocks, robots.txt patches, internal-link suggestions) — not just a list of issues. " +
        "An LLM drives 25 tools (sitemap fetch, template clustering, per-page rule checks, AEO probes) and produces a fix manifest with structured patches, each validated against a deterministic schema. " +
        "Costs real money (~$1-3 per audit on managed Anthropic). Capped at $2 / 60 tool calls / 180 seconds by default — adjust if the user asks for a deeper run. " +
        "Returns a text summary plus a compact structured summary (structuredContent); pass format:'json' to also get the full manifest in the text content. The structured `reason` field reports why the run stopped — an incomplete run is not flagged via isError. The full manifest can be streamed via the CLI: `pseolint orchestrate <domain> --manifest-out manifest.json`.",
      inputSchema: zodShape({
        domain: z.string().min(1).describe("URL of the site to audit (e.g. https://example.com). The orchestrator's first tool call fetches the sitemap."),
        maxCostUsd: z.number().min(0.1).max(MAX_ORCH_COST_USD).optional().default(2).describe(`Hard USD cap for this session. Default $2 (conservative for MCP-invoked sessions). Min $0.10, max $${MAX_ORCH_COST_USD}.`),
        maxToolCalls: z.number().int().min(1).max(MAX_ORCH_TOOL_CALLS).optional().default(60).describe(`Hard tool-call cap. Default 60. Max ${MAX_ORCH_TOOL_CALLS}.`),
        maxWallSeconds: z.number().int().min(10).max(MAX_ORCH_WALL_SECONDS).optional().default(180).describe(`Hard wall-clock cap in seconds. Default 180 (3 minutes). Min 10, max ${MAX_ORCH_WALL_SECONDS}.`),
        format: z.enum(["summary", "json"]).optional().default("summary").describe("'summary' = terse text for chat UI; 'json' = full manifest + validation + diff in the text content."),
      }),
      outputSchema: zodShape({
        reason: z.string(),
        completed: z.boolean(),
        usage: z.object({
          toolCallCount: z.number(),
          estimatedUsd: z.number(),
          elapsedMs: z.number(),
        }),
        verdict: z.string().optional(),
        categories: z.object({
          integrity: z.string(),
          discoverability: z.string(),
          citation: z.string(),
          data: z.string(),
        }).optional(),
        patches: z.object({
          valid: z.number(),
          total: z.number(),
          dropped: z.number(),
        }).optional(),
        pageCount: z.number().optional(),
        templateCount: z.number().optional(),
        domainLevelCount: z.number().optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ domain, maxCostUsd, maxToolCalls, maxWallSeconds, format }) => {
      try {
        const result = await orchestrate({
          domain,
          userId: "mcp",
          budget: {
            maxSessionUsd: maxCostUsd,
            maxToolCalls,
            maxWallSeconds,
          },
        });

        const structured = buildOrchestrateStructured(result.session.reason, result.session.usage, result.manifest, result.validation);

        let text: string;
        if (format === "json") {
          // Intentionally NOT size-bounded: the full manifest IS the payload here
          // and `structuredContent` carries only summary counts (no patches), so
          // enveloping would lose the patches entirely. Manifest size is instead
          // bounded upstream by the budget caps (cost / tool calls / wall time).
          text = JSON.stringify(
            { session: { reason: result.session.reason, usage: result.session.usage, error: result.session.error },
              manifest: result.manifest,
              validation: result.validation,
              diff: result.diff },
            null, 2,
          );
        } else {
          const summary = buildOrchestrateSummary(result.session.reason, result.session.usage, result.manifest, result.validation);
          text = truncateText(summary, `Use the CLI for the full manifest: pseolint orchestrate ${domain} --manifest-out manifest.json`).text;
        }

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: structured,
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: friendlyError(err, domain) }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Expose pseolint's rule knowledge (Open Knowledge Format bundle, lean subset)
 * as read-only MCP resources, keyed by ruleId so they line up 1:1 with the
 * `ruleId` on audit findings. An agent can audit, then read `pseolint://rules/<id>`
 * for what the rule detects and how to fix it — no web fetch, no extra tool.
 */
export function registerRuleKnowledge(server: McpServer): void {
  const indexUri = "pseolint://rules";
  server.registerResource(
    "pseolint-rules-index",
    indexUri,
    {
      title: "pseolint rule knowledge index",
      description: "Index of pSEO audit rules with knowledge resources. Read pseolint://rules/<ruleId> (the same ruleId on audit findings) for detection + fix guidance.",
      mimeType: "application/json",
    },
    (uri: URL) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            RULE_KNOWLEDGE.map((r) => ({ ruleId: r.ruleId, title: r.title, uri: `pseolint://rules/${r.ruleId}` })),
            null,
            2,
          ),
        },
      ],
    }),
  );

  for (const rule of RULE_KNOWLEDGE) {
    const uri = `pseolint://rules/${rule.ruleId}`;
    server.registerResource(
      `rule-${rule.ruleId}`,
      uri,
      {
        title: rule.title,
        description: rule.oneLiner,
        mimeType: "text/markdown",
      },
      (u: URL) => ({
        contents: [
          {
            uri: u.href,
            mimeType: "text/markdown",
            text:
              `# ${rule.title}\n\n` +
              `Rule \`${rule.ruleId}\` — ${rule.url}\n\n` +
              `## What it detects\n${rule.whatItDetects}\n\n` +
              `## How to fix\n${rule.howToFix.map((b) => `- ${b}`).join("\n")}\n`,
          },
        ],
      }),
    );
  }
}

export function createServer(): McpServer {
  const server = new McpServer({
    name: "pseolint",
    version,
  });
  registerReadOnlyTools(server);
  registerOrchestrateTool(server);
  registerRuleKnowledge(server);
  return server;
}

type OrchestrateUsage = { toolCallCount: number; estimatedUsd: number; elapsedMs: number };

/**
 * Compact structured summary of an orchestrate run — matches the tool's
 * outputSchema. Optional fields are omitted when no manifest was produced.
 * `completed` mirrors the run reason so clients have a boolean without parsing it.
 */
function buildOrchestrateStructured(
  reason: string,
  usage: OrchestrateUsage,
  manifest: FixManifest | null,
  validation: ManifestValidationReport | null,
) {
  // Project usage to exactly the declared fields — the real UsageSnapshot also
  // carries inputTokens/outputTokens, which would fail the strict outputSchema
  // (additionalProperties:false) if passed through.
  const base = {
    reason,
    completed: reason === "completed",
    usage: { toolCallCount: usage.toolCallCount, estimatedUsd: usage.estimatedUsd, elapsedMs: usage.elapsedMs },
  };
  if (!manifest) return base;
  return {
    ...base,
    verdict: manifest.verdict,
    categories: {
      integrity: manifest.categories.integrity,
      discoverability: manifest.categories.discoverability,
      citation: manifest.categories.citation,
      data: manifest.categories.data,
    },
    ...(validation ? {
      patches: {
        valid: validation.validPatches,
        total: validation.totalPatches,
        dropped: validation.failures.length,
      },
    } : {}),
    pageCount: manifest.pages.length,
    templateCount: manifest.templates.length,
    domainLevelCount: manifest.domainLevel.length,
  };
}

/**
 * Compact text summary suitable for an MCP chat UI. Long manifests get
 * truncated to top-3 patches per bucket; full output is available via the
 * CLI's `--manifest-out` flag.
 */
function buildOrchestrateSummary(
  reason: string,
  usage: OrchestrateUsage,
  manifest: FixManifest | null,
  validation: ManifestValidationReport | null,
): string {
  const lines: string[] = [];
  lines.push(`pseolint orchestrate · reason=${reason}`);
  lines.push(
    `  tool calls: ${usage.toolCallCount}` +
      `  ·  cost: $${usage.estimatedUsd.toFixed(3)}` +
      `  ·  duration: ${(usage.elapsedMs / 1000).toFixed(1)}s`,
  );

  if (!manifest) {
    lines.push("");
    lines.push("No manifest produced. The orchestrator stopped before calling finish_audit.");
    return lines.join("\n");
  }

  const cats = manifest.categories;
  lines.push(
    `  verdict: ${manifest.verdict}` +
      `  ·  ${cats.integrity}/${cats.discoverability}/${cats.citation}/${cats.data}` +
      ` (integrity / discoverability / citation / data)`,
  );

  if (validation) {
    const dropped = validation.failures.length;
    lines.push(
      `  patches: ${validation.validPatches}/${validation.totalPatches} valid` +
        (dropped > 0 ? `  ·  ${dropped} dropped (failed validation)` : ""),
    );
  }

  lines.push("");
  if (manifest.pages.length === 0 && manifest.templates.length === 0 && manifest.domainLevel.length === 0) {
    lines.push("Manifest is empty — orchestrator found nothing actionable.");
  } else {
    if (manifest.pages.length > 0) {
      lines.push(`Page-level patches (${manifest.pages.length} pages):`);
      for (const p of manifest.pages.slice(0, 3)) {
        const types = p.changes.map((c) => c.type).join(", ");
        lines.push(`  • ${p.url}: ${types}`);
      }
      if (manifest.pages.length > 3) lines.push(`  … and ${manifest.pages.length - 3} more`);
      lines.push("");
    }
    if (manifest.templates.length > 0) {
      lines.push(`Template-level patches (${manifest.templates.length} templates):`);
      for (const t of manifest.templates.slice(0, 3)) {
        lines.push(`  • ${t.templateId} (${t.affectedUrlCount} URLs): ${t.recommendation}`);
      }
      if (manifest.templates.length > 3) lines.push(`  … and ${manifest.templates.length - 3} more`);
      lines.push("");
    }
    if (manifest.domainLevel.length > 0) {
      lines.push(`Domain-level patches (${manifest.domainLevel.length}):`);
      for (const d of manifest.domainLevel.slice(0, 3)) {
        lines.push(`  • ${d.type}: ${d.reason}`);
      }
      if (manifest.domainLevel.length > 3) lines.push(`  … and ${manifest.domainLevel.length - 3} more`);
      lines.push("");
    }
  }

  lines.push("For full manifest + diffs: `pseolint orchestrate " + manifest.domain + " --manifest-out manifest.json`");
  return lines.join("\n");
}

export async function startMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
