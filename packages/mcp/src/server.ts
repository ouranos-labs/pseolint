import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { auditSource, formatConsole, formatJson } from "@pseolint/core";
import type { AuditOptions, AuditSummary } from "@pseolint/core";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const MCP_SAMPLE_CAP = 50;

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

function scoreLabel(score: number): string {
  if (score <= 20) return "Safe";
  if (score <= 40) return "Caution";
  if (score <= 60) return "Risky";
  if (score <= 80) return "Dangerous";
  return "Critical";
}

function buildExplanation(summary: AuditSummary, threshold: number): string {
  const lines: string[] = [];
  const label = scoreLabel(summary.score);
  const passFail = summary.score >= threshold ? "FAIL" : "PASS";

  lines.push(`SpamBrain Risk Score: ${summary.score}/100 (${label}) — ${passFail} at threshold ${threshold}`);
  lines.push(`Pages analysed: ${summary.pageCount}`);

  if (summary.templateDetected) {
    lines.push("");
    lines.push("Template-generated content detected. Fix suggestions are tailored for template authors.");
  }

  lines.push("");
  lines.push("Category breakdown:");
  for (const [cat, score] of Object.entries(summary.categoryScores)) {
    const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
    lines.push(`  ${catLabel}: ${score}/100`);
  }

  const ruleCounts = new Map<string, number>();
  for (const f of summary.findings) {
    ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
  }

  if (ruleCounts.size > 0) {
    lines.push("");
    lines.push("What's driving the score (fix in this order):");

    const effortOrder = ["quick", "moderate", "structural"];
    const withEffort = Array.from(ruleCounts.entries()).map(([ruleId, count]) => {
      const finding = summary.findings.find((f) => f.ruleId === ruleId);
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

  if (summary.score >= threshold) {
    lines.push("");
    lines.push(`Your score of ${summary.score} exceeds the threshold of ${threshold}. Focus on the quick fixes first to bring the score down, then tackle structural issues.`);
  } else {
    lines.push("");
    lines.push(`Your score of ${summary.score} is below the threshold of ${threshold}. Site passes CI checks.`);
  }

  return lines.join("\n");
}

const CROSS_PAGE_RULES = new Set([
  "spam/near-duplicate", "spam/entity-swap", "spam/boilerplate-ratio",
  "spam/template-diversity", "spam/publication-velocity", "spam/doorway-pattern",
  "spam/template-coverage", "content/unique-value", "content/heading-uniqueness",
  "content/meta-uniqueness", "cannibal/title-overlap", "cannibal/keyword-collision",
  "cannibal/url-pattern", "links/orphan-pages", "links/dead-ends",
  "links/cluster-connectivity", "links/hub-pages",
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
      description: "Use when a user asks to check their website for SEO issues, SpamBrain risk, duplicate content, thin pages, or before deploying a programmatic SEO site. Crawls the site, runs 35 rules across 6 categories, and returns a SpamBrain Risk Score (0-100) with actionable findings. For sites with many pages, results are automatically capped to keep response times reasonable.",
      inputSchema: {
        source: z.string().describe("URL (e.g. http://localhost:3000) or local directory path (e.g. ./out) to audit"),
        threshold: z.number().optional().default(40).describe("Score threshold — audit fails if score >= this value (default: 40)"),
        sampleSize: z.number().optional().default(0).describe("Audit a random subset of N pages. 0 = all pages up to internal cap of 50 for MCP. Set explicitly to override."),
        format: z.enum(["console", "json"]).optional().default("console").describe("Output format. Use 'json' for structured data, 'console' for human-readable summary."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ source, threshold, sampleSize, format }) => {
      try {
        const options: AuditOptions = {};
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
          isError: summary.score >= threshold,
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
      title: "Explain SpamBrain Risk Score",
      description: "Use when a user wants to understand WHY their SpamBrain score is high, what categories are failing, and what to fix first. Returns a prioritized breakdown with quick wins listed before structural fixes, and a pass/fail verdict against the threshold.",
      inputSchema: {
        source: z.string().describe("URL (e.g. http://localhost:3000) or local directory path (e.g. ./out) to audit"),
        threshold: z.number().optional().default(40).describe("Score threshold for pass/fail verdict (default: 40)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ source, threshold }) => {
      try {
        const options: AuditOptions = { sampleSize: MCP_SAMPLE_CAP };
        const summary = await auditSource(source, options);
        const text = buildExplanation(summary, threshold);

        return {
          content: [{ type: "text" as const, text }],
          isError: summary.score >= threshold,
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
      inputSchema: {
        url: z.string().describe("Full URL of the page to check (e.g. https://yoursite.com/templates/california-llc)"),
      },
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
        };

        const summary = await auditSource(url, options);
        const perPageFindings = summary.findings.filter((f) => !CROSS_PAGE_RULES.has(f.ruleId));

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

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
