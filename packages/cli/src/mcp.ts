import { auditSource, formatConsole, formatJson } from "@pseolint/core";
import type { AuditOptions } from "@pseolint/core";
import * as readline from "node:readline";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TOOLS = [
  {
    name: "audit_site",
    description: "Run a full pseolint audit on a URL or directory. Returns SpamBrain Risk Score and findings.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "URL or directory path to audit" },
        threshold: { type: "number", description: "Score threshold (default: 40)" },
        sampleSize: { type: "number", description: "Audit a random subset of N pages (0 = all)" },
        format: { type: "string", enum: ["console", "json"], description: "Output format (default: console)" },
      },
      required: ["source"],
    },
  },
  {
    name: "explain_score",
    description: "Run an audit and explain what's driving the SpamBrain Risk Score. Returns a human-readable breakdown.",
    inputSchema: {
      type: "object",
      properties: {
        source: { type: "string", description: "URL or directory path to audit" },
      },
      required: ["source"],
    },
  },
];

function send(response: JsonRpcResponse): void {
  process.stdout.write(JSON.stringify(response) + "\n");
}

async function handleToolCall(id: number | string, name: string, args: Record<string, unknown>): Promise<void> {
  try {
    if (name === "audit_site") {
      const source = args.source as string;
      const options: AuditOptions = {};
      if (args.sampleSize) options.sampleSize = args.sampleSize as number;

      const summary = await auditSource(source, options);
      const format = (args.format as string) ?? "console";
      const threshold = (args.threshold as number) ?? 40;

      let text: string;
      if (format === "json") {
        text = formatJson(summary);
      } else {
        text = formatConsole(summary, { noColor: true });
      }

      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text }],
          isError: summary.score >= threshold,
        },
      });
    } else if (name === "explain_score") {
      const source = args.source as string;
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

      // Group findings by rule for explanation
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

      send({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: lines.join("\n") }],
        },
      });
    } else {
      send({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${name}` },
      });
    }
  } catch (err) {
    send({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: err instanceof Error ? err.message : String(err) },
    });
  }
}

function handleMessage(msg: JsonRpcRequest): void {
  switch (msg.method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "pseolint", version: "0.1.0" },
        },
      });
      break;

    case "notifications/initialized":
      // No response needed for notifications
      break;

    case "tools/list":
      send({
        jsonrpc: "2.0",
        id: msg.id,
        result: { tools: TOOLS },
      });
      break;

    case "tools/call": {
      const params = msg.params as { name: string; arguments?: Record<string, unknown> };
      handleToolCall(msg.id, params.name, params.arguments ?? {});
      break;
    }

    default:
      if (msg.id !== undefined) {
        send({
          jsonrpc: "2.0",
          id: msg.id,
          error: { code: -32601, message: `Method not found: ${msg.method}` },
        });
      }
      break;
  }
}

export function startMcpServer(): void {
  const rl = readline.createInterface({ input: process.stdin });

  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line) as JsonRpcRequest;
      handleMessage(msg);
    } catch {
      // Ignore malformed JSON
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}
