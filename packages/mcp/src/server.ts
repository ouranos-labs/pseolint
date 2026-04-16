import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createRequire } from "node:module";
import { auditSource, formatConsole, formatJson } from "@pseolint/core";
import type { AuditOptions } from "@pseolint/core";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

export function createServer(): McpServer {
  const server = new McpServer({
    name: "pseolint",
    version,
  });

  // Tool: audit_site
  server.tool(
    "audit_site",
    "Run a full pseolint audit on a URL or directory. Returns SpamBrain Risk Score and findings.",
    {
      source: z.string().describe("URL or directory path to audit"),
      threshold: z.number().optional().default(40).describe("Score threshold for pass/fail"),
      sampleSize: z.number().optional().default(0).describe("Audit a random subset of N pages (0 = all)"),
      format: z.enum(["console", "json"]).optional().default("console").describe("Output format"),
    },
    async ({ source, threshold, sampleSize, format }) => {
      const options: AuditOptions = {};
      if (sampleSize > 0) options.sampleSize = sampleSize;

      const summary = await auditSource(source, options);

      let text: string;
      if (format === "json") {
        text = formatJson(summary);
      } else {
        text = formatConsole(summary, { noColor: true });
      }

      return {
        content: [{ type: "text", text }],
        isError: summary.score >= threshold,
      };
    }
  );

  // Tool: explain_score
  server.tool(
    "explain_score",
    "Run an audit and explain what's driving the SpamBrain Risk Score with category breakdowns and prioritized fixes.",
    {
      source: z.string().describe("URL or directory path to audit"),
    },
    async ({ source }) => {
      const summary = await auditSource(source);

      const lines: string[] = [];
      lines.push(`SpamBrain Risk Score: ${summary.score}/100`);
      lines.push(`Pages analysed: ${summary.pageCount}`);
      lines.push("");
      lines.push("Category breakdown:");
      for (const [cat, score] of Object.entries(summary.categoryScores)) {
        const label = cat.charAt(0).toUpperCase() + cat.slice(1);
        lines.push(`  ${label}: ${score}/100`);
      }
      lines.push("");

      const ruleCounts = new Map<string, number>();
      for (const f of summary.findings) {
        ruleCounts.set(f.ruleId, (ruleCounts.get(f.ruleId) ?? 0) + 1);
      }

      if (ruleCounts.size > 0) {
        lines.push("What's driving the score:");
        const sorted = Array.from(ruleCounts.entries()).sort((a, b) => b[1] - a[1]);
        for (const [ruleId, count] of sorted.slice(0, 10)) {
          const finding = summary.findings.find((f) => f.ruleId === ruleId);
          lines.push(`  - ${ruleId}: ${count} finding${count !== 1 ? "s" : ""}${finding?.effort ? ` [${finding.effort}]` : ""}`);
          if (finding?.fix) {
            lines.push(`    Fix: ${finding.fix}`);
          }
        }
      }

      if (summary.templateDetected) {
        lines.push("");
        lines.push("Note: Template-generated content detected. Fix suggestions are tailored for template authors.");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  );

  // Tool: check_page
  server.tool(
    "check_page",
    "Quick check a single page URL against pseolint rules. Faster than a full site audit.",
    {
      url: z.string().describe("URL of the page to check"),
    },
    async ({ url }) => {
      const options: AuditOptions = {
        crawlDiscovery: false,
        sampleSize: 1,
      };

      const summary = await auditSource(url, options);
      const text = formatConsole(summary, { noColor: true });

      return {
        content: [{ type: "text", text }],
      };
    }
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
