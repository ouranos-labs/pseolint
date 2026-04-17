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
  state?: string | boolean;
  since: boolean;
  exitOnRegression: boolean;
}

export async function runCli(
  args: string[] = process.argv.slice(2),
): Promise<number> {
  const program = new Command();

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
    .option("--state [path]", "Enable state persistence (default path: .pseolint/state.json)")
    .option("--since", "Delta mode: audit only URLs changed since prior --state (requires --state)")
    .option("--exit-on-regression", "Exit non-zero when new rule IDs fire vs prior --state")
    .option("--mcp", "Start as an MCP server (for AI coding assistants)");

  program.parse(args, { from: "user" });

  const opts = program.opts<CliOptions>();
  const source = program.args[0];

  if (opts.mcp) {
    const { startMcpServer } = await import("./mcp.js");
    startMcpServer();
    return 0; // never reached, server runs until stdin closes
  }

  if (!source) {
    program.help();
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
