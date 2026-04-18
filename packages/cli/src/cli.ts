#!/usr/bin/env node
import { Command } from "commander";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import {
  auditSource,
  formatConsole,
  formatJson,
  formatMarkdown,
  formatHtml,
} from "@pseolint/core";
import type { AuditSummary, ConsoleFormatOptions } from "@pseolint/core";
import type { CliFlags } from "./config.js";
import { loadConfig, mergeOptions } from "./config.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

type FormatType = "console" | "json" | "markdown" | "html";

const formatters: Record<FormatType, (summary: AuditSummary) => string> = {
  console: formatConsole,
  json: formatJson,
  markdown: formatMarkdown,
  html: formatHtml,
};

interface CliOptions {
  format: FormatType;
  threshold: string;
  output?: string;
  color: boolean;
  concurrency: string;
  timeout: string;
  sampleSize: string;
  ignore?: string;
  render: boolean;
  browserWs?: string;
  crawl: boolean;
  mcp: boolean;
  dataSource?: string;
  cache?: string | boolean;
  cacheTtl: string;
  strategy: string;
  maxPerTemplate: string;
  state?: string | boolean;
  since: boolean;
  exitOnRegression: boolean;
  ai?: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiEndpoint?: string;
  aiMaxTokens: number;
  aiCacheTtl: string;
  aiCache: boolean;
  aiSuggest: boolean;
  telemetry?: boolean;
  telemetryPrompt?: boolean;
  telemetryPath?: string;
  triageFeedback?: string;
}

export async function runCli(
  args: string[] = process.argv.slice(2),
): Promise<number> {
  const program = new Command();
  let exitCode = 0;

  program
    .name("pseolint")
    .description("Programmatic SEO linter — audit sites for SpamBrain risk")
    .version(version)
    .argument("[source]", "Directory path or URL to audit")
    .option(
      "-f, --format <type>",
      "Output format: console, json, markdown, html",
      "console",
    )
    .option(
      "-t, --threshold <n>",
      "SpamBrain Risk Score threshold for CI exit code",
      "40",
    )
    .option("-o, --output <file>", "Write report to file instead of stdout")
    .option("--no-color", "Disable colored output")
    .option("--concurrency <n>", "Max parallel HTTP fetches", "5")
    .option("--timeout <ms>", "Per-request timeout in ms", "30000")
    .option("--sample-size <n>", "Audit a random subset of N pages", "0")
    .option("--ignore <patterns>", "Comma-separated glob patterns to exclude")
    .option("--render", "Render pages in a browser before auditing")
    .option("--browser-ws <url>", "CDP WebSocket endpoint for browser rendering")
    .option("--no-crawl", "Disable crawl-based page discovery for URL sources")
    .option("--data-source <file>", "JSON file with source data for content verification")
    .option("--cache [dir]", "Enable HTTP cache (default dir: .pseolint/cache)")
    .option("--cache-ttl <duration>", "Cache TTL for entries without validators, e.g. 7d, 1h, 30m", "7d")
    .option("--strategy <random|stratified>", "Sampling strategy when --sample-size is set", "stratified")
    .option("--max-per-template <n>", "Cap samples per URL template cluster", "0")
    .option("--state [path]", "Enable state persistence (default path: .pseolint/state.json)")
    .option("--since", "Delta mode: audit only URLs changed since prior --state (requires --state)")
    .option("--exit-on-regression", "Exit non-zero when new rule IDs fire vs prior --state")
    .option("--ai", "Enable AI triage of findings")
    .option(
      "--ai-provider <id>",
      "AI provider: anthropic | openai | google | mistral | groq | xai | cohere | ollama (default: auto-detect)",
    )
    .option("--ai-model <name>", "AI model name (overrides provider default)")
    .option("--ai-endpoint <url>", "AI endpoint (Ollama only; default: http://localhost:11434)")
    .option("--ai-max-tokens <n>", "Input token cap per triage call", (v) => parseInt(v, 10), 60000)
    .option("--ai-cache-ttl <duration>", "Triage cache TTL (e.g. 30d, 12h, 60s)", "30d")
    .option("--no-ai-cache", "Bypass AI triage cache for this run")
    .option("--no-ai-suggest", "Suppress AI discovery hint")
    .option("--telemetry", "Enable local telemetry write (.pseolint/telemetry.jsonl)")
    .option("--no-telemetry-prompt", "Suppress the y/n/skip triage feedback prompt")
    .option("--telemetry-path <file>", "Override telemetry JSONL path")
    .option("--triage-feedback <rating>", "Non-interactive feedback: helpful|unhelpful|y|n")
    .option("--mcp", "Start as an MCP server (for AI coding assistants)")
    .action(async (source: string | undefined, opts: CliOptions) => {
      exitCode = await runAudit(source, opts);
    });

  program
    .command("stats")
    .description("Show aggregate telemetry stats from .pseolint/telemetry.jsonl")
    .option("--path <file>", "Path to telemetry JSONL", ".pseolint/telemetry.jsonl")
    .option("--json", "Output stats as JSON")
    .action(async (opts: { path: string; json?: boolean }) => {
      const { readTelemetryJsonl, aggregateTelemetry } = await import("@pseolint/core");
      const records = await readTelemetryJsonl(opts.path);
      const stats = aggregateTelemetry(records);
      if (opts.json) {
        process.stdout.write(JSON.stringify(stats, null, 2) + "\n");
        return;
      }
      renderStats(stats);
    });

  program
    .command("stats-export <outPath>")
    .description("Copy telemetry JSONL to <outPath> for manual review/sharing")
    .option("--path <file>", "Path to telemetry JSONL", ".pseolint/telemetry.jsonl")
    .action(async (outPath: string, opts: { path: string }) => {
      const { copyFile } = await import("node:fs/promises");
      try {
        await copyFile(opts.path, outPath);
        process.stderr.write(`Wrote ${outPath}\n`);
      } catch (e) {
        process.stderr.write(`Failed to read ${opts.path}: ${(e as Error).message}\n`);
        exitCode = 1;
      }
    });

  await program.parseAsync(args, { from: "user" });
  return exitCode;
}

async function runAudit(
  source: string | undefined,
  opts: CliOptions,
): Promise<number> {
  if (opts.mcp) {
    const { startMcpServer } = await import("./mcp.js");
    startMcpServer();
    return 0; // never reached, server runs until stdin closes
  }

  if (!source) {
    // Print help via a temporary Command since we're inside the action
    process.stderr.write("Error: source argument is required. Run `pseolint --help` for usage.\n");
    return 1;
  }

  const threshold = Number(opts.threshold);
  if (Number.isNaN(threshold)) {
    console.error(`Error: --threshold must be a number, got "${opts.threshold}"`);
    return 1;
  }

  const format = opts.format as FormatType;
  if (!formatters[format]) {
    console.error(
      `Error: unknown format "${format}". Choose from: console, json, markdown, html`,
    );
    return 1;
  }

  // Load config file and merge with CLI flags
  const configFile = await loadConfig();
  const cliFlags: CliFlags = {
    concurrency: opts.concurrency !== "5" ? Number(opts.concurrency) : undefined,
    timeout: opts.timeout !== "30000" ? Number(opts.timeout) : undefined,
    sampleSize: opts.sampleSize !== "0" ? Number(opts.sampleSize) : undefined,
    ignore: opts.ignore ? opts.ignore.split(",").map((s: string) => s.trim()) : undefined,
    render: opts.render ? { browserWsEndpoint: opts.browserWs } : undefined,
    crawlDiscovery: opts.crawl === false ? false : undefined,
    samplingStrategy: opts.strategy === "random" ? "random" : "stratified",
    maxPerTemplate: opts.maxPerTemplate !== "0" ? Number(opts.maxPerTemplate) : undefined,
  };

  if (opts.cache) {
    try {
      cliFlags.cache = {
        dir: typeof opts.cache === "string" ? opts.cache : undefined,
        ttlMs: parseDuration(opts.cacheTtl),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      return 1;
    }
  }

  if ((opts.since || opts.exitOnRegression) && !opts.state) {
    console.error("Error: --since and --exit-on-regression require --state to be set");
    return 1;
  }

  if (opts.state || opts.since || opts.exitOnRegression) {
    cliFlags.state = {
      path: typeof opts.state === "string" ? opts.state : undefined,
      since: Boolean(opts.since),
      exitOnRegression: Boolean(opts.exitOnRegression),
    };
  }

  // AI flags
  let aiCache: { ttlMs: number } | false;
  try {
    aiCache = opts.aiCache === false ? false : { ttlMs: parseDuration(opts.aiCacheTtl) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }

  if (opts.ai) {
    cliFlags.ai = {
      enabled: true,
      provider: opts.aiProvider,
      model: opts.aiModel,
      endpoint: opts.aiEndpoint,
      maxInputTokens: opts.aiMaxTokens,
      suggest: opts.aiSuggest !== false,
      cache: aiCache,
    };
  } else if (opts.aiSuggest === false) {
    // allow suppressing the hint without enabling AI
    cliFlags.ai = { suggest: false };
  }

  const telemetryFeedback = opts.triageFeedback
    ? (opts.triageFeedback === "y" || opts.triageFeedback === "yes" || opts.triageFeedback === "helpful")
      ? "helpful" as const
      : (opts.triageFeedback === "n" || opts.triageFeedback === "no" || opts.triageFeedback === "unhelpful")
        ? "unhelpful" as const
        : undefined
    : undefined;

  const telemetry = opts.telemetry || opts.telemetryPath || telemetryFeedback || opts.telemetryPrompt === false
    ? {
        enabled: opts.telemetry === true,
        path: opts.telemetryPath,
        prompt: opts.telemetryPrompt !== false,
        feedback: telemetryFeedback,
      }
    : undefined;

  if (telemetry !== undefined) {
    cliFlags.telemetry = telemetry;
  }

  const options = mergeOptions(configFile, cliFlags);

  if (opts.dataSource) {
    const { loadDataSource } = await import("@pseolint/core");
    try {
      const records = await loadDataSource(opts.dataSource);
      options.dataSource = { records };
      console.log(`Loaded ${records.length} data source records from ${opts.dataSource}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error loading data source: ${message}`);
      return 1;
    }
  }

  // Run audit
  let summary;
  try {
    summary = await auditSource(source, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  }

  if (summary.cacheStats && summary.cacheStats.total > 0) {
    const { hits, total, bytesSavedEstimate } = summary.cacheStats;
    const mb = (bytesSavedEstimate / (1024 * 1024)).toFixed(2);
    console.error(`Cache: ${hits}/${total} hits (${mb} MB saved)`);
  }

  // Format output
  const output = format === "console"
    ? formatConsole(summary, { noColor: !opts.color })
    : formatters[format](summary);

  // Write or print
  if (opts.output) {
    const { dirname } = await import("node:path");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dirname(opts.output), { recursive: true });
    await writeFile(opts.output, output, "utf-8");
    console.log(`Report written to ${opts.output}`);
  } else {
    console.log(output);
  }

  // Exit code based on threshold + regression
  let exitCode = summary.score >= threshold ? 1 : 0;
  if (summary.hasRegression) {
    console.error("Regression detected: new rule IDs fired vs prior state");
    exitCode = Math.max(exitCode, 1);
  }
  return exitCode;
}

import type { TelemetryStats } from "@pseolint/core";

function renderStats(stats: TelemetryStats): void {
  const NA = "—";
  const formatDuration = (ms: number | null): string => {
    if (ms === null) return NA;
    return `${(ms / 1000).toFixed(1)}s`;
  };
  const formatRound = (n: number | null): string => {
    if (n === null) return NA;
    return String(Math.round(n));
  };
  const formatPct = (num: number, denom: number): string => {
    if (denom === 0) return NA;
    return `${Math.round((num / denom) * 100)}%`;
  };
  const formatNum = (n: number): string => n.toLocaleString("en-US");
  const formatCost = (n: number): string => {
    if (n === 0) return NA;
    return `$${n.toFixed(2)}`;
  };
  const formatDate = (s: string | null): string => s ?? NA;
  const pad = (label: string): string => label.padEnd(20);

  const lines: string[] = [];
  lines.push("Telemetry summary");
  lines.push(`  ${pad("Total audits")}:  ${stats.totalAudits}`);
  lines.push(`  ${pad("Average duration")}:  ${formatDuration(stats.avgDurationMs)}`);
  lines.push(`  ${pad("Average score")}:  ${formatRound(stats.avgScore)}`);
  lines.push(`  ${pad("Average findings")}:  ${formatRound(stats.avgFindings)}`);
  lines.push(`  ${pad("Average page count")}:  ${formatRound(stats.avgPages)}`);
  lines.push("");
  lines.push("AI triage");
  lines.push(`  ${pad("Audits with triage")}:  ${stats.triageUsed}`);
  lines.push(`  ${pad("Cache hit rate")}:  ${formatPct(stats.triageCacheHits, stats.triageUsed)}`);
  lines.push(
    `  ${pad("Tokens (in/out)")}:  ${formatNum(stats.totalTokenInput)} / ${formatNum(stats.totalTokenOutput)}`,
  );
  lines.push(`  ${pad("Estimated cost")}:  ${formatCost(stats.totalEstimatedCostUsd)}`);
  lines.push("");
  lines.push("Feedback");
  lines.push(`  ${pad("Helpful")}:  ${stats.feedbackBreakdown.helpful}`);
  lines.push(`  ${pad("Unhelpful")}:  ${stats.feedbackBreakdown.unhelpful}`);
  lines.push(`  ${pad("Skipped")}:  ${stats.feedbackBreakdown.skipped}`);
  lines.push("");
  lines.push("Data range");
  lines.push(`  ${pad("First run")}:  ${formatDate(stats.firstRun)}`);
  lines.push(`  ${pad("Last run")}:  ${formatDate(stats.lastRun)}`);

  process.stdout.write(lines.join("\n") + "\n");
}

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)(ms|s|m|h|d)$/);
  if (!m) throw new Error(`invalid duration: ${s}. Use e.g. 1h, 30m, 7d.`);
  const n = Number(m[1]);
  const unit = m[2];
  const mul = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit] ?? 1;
  return n * mul;
}

// Direct execution
const scriptUrl = `file://${process.argv[1]?.replace(/\\/g, "/")}`;
if (
  import.meta.url === scriptUrl ||
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`
) {
  runCli().then((code) => {
    process.exit(code);
  });
}
