import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { auditSource, formatConsole, formatJson, orchestrate } from "@pseolint/core";
import type { AuditOptions, AuditSummary, FixManifest, ManifestValidationReport, RuleResult } from "@pseolint/core";

/**
 * MCP SDK 1.29's `inputSchema` is typed as `ZodRawShapeCompat = Record<string,
 * z3.ZodTypeAny | z4.$ZodType>` via a zod-compat shim. zod 4.4.x's high-level
 * `ZodString` / `ZodNumber` extend `core.$ZodType` from `zod/v4/core`, so they
 * satisfy the runtime contract — but TypeScript 6 strict mode infers the
 * union's z3 branch first and reports a structural mismatch against z3
 * internals (`_type`, `_parse`, etc.) that v4 schemas don't have.
 *
 * We name the SDK's expected shape via `inputShape<T>()`: it accepts a
 * Record<string, ZodTypeAny> at the call site (so each tool's schema stays
 * authored in plain zod 4 syntax) and returns a value typed as the SDK's
 * `ZodRawShapeCompat`. One cast, one place, no runtime cost. Handler args
 * keep their explicit types below to compensate for the lost inference.
 */
function inputShape<T extends Record<string, z.ZodTypeAny>>(shape: T): T & ZodRawShapeCompat {
  return shape as unknown as T & ZodRawShapeCompat;
}

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const MCP_SAMPLE_CAP = (() => {
  const raw = process.env.PSEOLINT_MCP_SAMPLE_CAP;
  if (!raw) return 50;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 50;
})();

function friendlyError(err: unknown, source: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("fetch") || msg.includes("ECONNREFUSED")) {
    return `Could not reach ${source}. If this is a local dev server, make sure it is running. Original error: ${msg}`;
  }
  if (msg.includes("Unable to access source")) {
    return `Directory not found: ${source}. Check the path exists and is readable.`;
  }
  if (msg.includes("ETIMEDOUT") || msg.includes("timeout")) {
    return `Request to ${source} timed out. The site may be slow or unreachable. Try increasing the timeout or using --sample-size to audit fewer pages.`;
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

function buildExplanation(summary: AuditSummary, threshold: number): string {
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
    const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
    lines.push(`  ${catLabel}: ${info.grade} (${info.issues} issue${info.issues === 1 ? "" : "s"})`);
  }

  const allFindings = flattenIssues(summary);
  const ruleCounts = new Map<string, number>();
  for (const f of allFindings) {
    ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
  }

  if (ruleCounts.size > 0) {
    lines.push("");
    lines.push("What's driving the verdict (fix in this order):");

    const effortOrder = ["quick", "moderate", "structural"];
    const withEffort = Array.from(ruleCounts.entries()).map(([ruleId, count]) => {
      const finding = allFindings.find((f) => f.ruleId === ruleId);
      return { ruleId, count, finding };
    }).sort((a, b) => {
      const ea = effortOrder.indexOf(a.finding?.effort ?? "moderate");
      const eb = effortOrder.indexOf(b.finding?.effort ?? "moderate");
      if (ea !== eb) return ea - eb;
      return b.count - a.count;
    });

    for (const { ruleId, count, finding } of withEffort.slice(0, 10)) {
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

  if (summary.risk >= threshold) {
    lines.push("");
    lines.push(`Risk ${summary.risk} exceeds threshold ${threshold}. Focus on quick fixes first to bring risk down, then tackle structural issues.`);
  } else {
    lines.push("");
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

export function createServer(): McpServer {
  const server = new McpServer({
    name: "pseolint",
    version,
  });

  server.registerTool(
    "audit_site",
    {
      title: "Audit Site for SpamBrain Risk",
      description: "Use when a user asks to check their website for SEO issues, SpamBrain risk, duplicate content, thin pages, or before deploying a programmatic SEO site. Crawls the site, runs 32 rules across 4 categories (integrity, discoverability, citation, data), and returns a verdict (ready/caution/concerning/critical) plus a numeric risk score (0-100, lower is better) with actionable findings. Pre-flight site classification suppresses pSEO-targeted rules on small marketing sites and blogs unless --strict is passed. v0.5.11: when the audited site has ≥2 detected URL templates, the JSON response includes a `templates` array with per-template verdicts, risk scores, category grades, variance metrics (uniformityScore, topDriver), and the list of audited URLs for each template. Additive — `findings` flat list remains present.",
      inputSchema: inputShape({
        source: z.string().describe("URL (e.g. http://localhost:3000) or local directory path (e.g. ./out) to audit"),
        threshold: z.number().optional().default(40).describe("Risk threshold — audit fails if risk >= this value (default: 40, semantically equivalent to 'caution' verdict)"),
        sampleSize: z.number().optional().default(0).describe("Audit a random subset of N pages. 0 = all pages up to internal cap of 50 for MCP. Set explicitly to override."),
        format: z.enum(["console", "json"]).optional().default("console").describe("Output format. Use 'json' for structured data, 'console' for human-readable summary."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ source, threshold, sampleSize, format }) => {
      try {
        // MCP audits run on user-supplied URLs inside AI-assistant environments
        // where the LLM may not vet the target. `safeMode: "saas"` flips on
        // guardSsrf (DNS-validated private-range check), tightens maxFetchBytes,
        // and keeps robots.txt honoured — see packages/core SafeMode docs.
        const options: AuditOptions = { safeMode: "saas" };
        if (sampleSize > 0) {
          options.sampleSize = sampleSize;
        } else {
          options.sampleSize = MCP_SAMPLE_CAP;
        }

        const summary = await auditSource(source, options);

        let text: string;
        if (format === "json") {
          text = formatJson(summary);
        } else {
          text = formatConsole(summary, { noColor: true });
        }

        if (summary.pageCount >= MCP_SAMPLE_CAP && sampleSize === 0) {
          text += `\n\nNote: Results capped to ${MCP_SAMPLE_CAP} pages for performance. Run the CLI directly for a full audit: npx pseolint ${source}`;
        }

        return {
          content: [{ type: "text" as const, text }],
          isError: summary.risk >= threshold,
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
    "explain_score",
    {
      title: "Explain pseolint Verdict",
      description: "Use when a user wants to understand WHY their pseolint verdict is concerning/critical, what categories are failing, and what to fix first. Returns a prioritized breakdown with quick wins listed before structural fixes, plus a pass/fail verdict against the risk threshold.",
      inputSchema: inputShape({
        source: z.string().describe("URL (e.g. http://localhost:3000) or local directory path (e.g. ./out) to audit"),
        threshold: z.number().optional().default(40).describe("Risk threshold for pass/fail verdict (default: 40)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ source, threshold }) => {
      try {
        const options: AuditOptions = { sampleSize: MCP_SAMPLE_CAP, safeMode: "saas" };
        const summary = await auditSource(source, options);
        const text = buildExplanation(summary, threshold);

        return {
          content: [{ type: "text" as const, text }],
          isError: summary.risk >= threshold,
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
    "check_page_technical",
    {
      title: "Check Single Page Technical SEO",
      description: "Use when a user asks to check a specific page URL for technical SEO issues. Checks per-page rules only: canonical tags, Open Graph tags, JSON-LD schema, robots directives, meta tags, thin content, and author signals. Does NOT check cross-page rules (duplicates, cannibalization, linking) — use audit_site for those.",
      inputSchema: inputShape({
        url: z.string().describe("Full URL of the page to check (e.g. https://yoursite.com/templates/california-llc)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
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
        lines.push("Note: This checks per-page technical rules only. For cross-page analysis (duplicates, cannibalization, linking), use audit_site.");

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: friendlyError(err, url) }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "orchestrate_audit",
    {
      title: "Orchestrate AI-Native pSEO Audit",
      description:
        "Use when a user wants concrete, paste-able fixes (rewritten H1s, JSON-LD blocks, robots.txt patches, internal-link suggestions) — not just a list of issues. " +
        "An LLM drives 25 tools (sitemap fetch, template clustering, per-page rule checks, AEO probes) and produces a fix manifest with structured patches, each validated against a deterministic schema. " +
        "Costs real money (~$1-3 per audit on managed Anthropic). Capped at $2 / 60 tool calls / 180 seconds by default — adjust if the user asks for a deeper run. " +
        "Returns a text summary plus the structured manifest if `format` is 'json'. The full manifest can be streamed via the CLI: `pseolint orchestrate <domain> --manifest-out manifest.json`.",
      inputSchema: inputShape({
        domain: z.string().describe("URL of the site to audit (e.g. https://example.com). The orchestrator's first tool call fetches the sitemap."),
        maxCostUsd: z.number().optional().default(2).describe("Hard USD cap for this session. Default $2 (conservative for MCP-invoked sessions)."),
        maxToolCalls: z.number().int().optional().default(60).describe("Hard tool-call cap. Default 60."),
        maxWallSeconds: z.number().int().optional().default(180).describe("Hard wall-clock cap in seconds. Default 180 (3 minutes)."),
        format: z.enum(["summary", "json"]).optional().default("summary").describe("'summary' = terse text for chat UI; 'json' = full manifest + validation + diff."),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
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

        if (format === "json") {
          return {
            content: [{ type: "text" as const, text: JSON.stringify(
              { session: { reason: result.session.reason, usage: result.session.usage, error: result.session.error },
                manifest: result.manifest,
                validation: result.validation,
                diff: result.diff },
              null, 2,
            ) }],
            isError: result.session.reason !== "completed",
          };
        }

        const text = buildOrchestrateSummary(result.session.reason, result.session.usage, result.manifest, result.validation);
        return {
          content: [{ type: "text" as const, text }],
          isError: result.session.reason !== "completed",
        };
      } catch (err) {
        return {
          content: [{ type: "text" as const, text: friendlyError(err, domain) }],
          isError: true,
        };
      }
    }
  );

  return server;
}

/**
 * Compact text summary suitable for an MCP chat UI. Long manifests get
 * truncated to top-3 patches per bucket; full output is available via the
 * CLI's `--manifest-out` flag.
 */
function buildOrchestrateSummary(
  reason: string,
  usage: { toolCallCount: number; estimatedUsd: number; elapsedMs: number },
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
