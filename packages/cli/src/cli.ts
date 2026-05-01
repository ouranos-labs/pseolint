#!/usr/bin/env node
import { Command } from "commander";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  auditSource,
  formatConsole,
  formatJson,
  formatMarkdown,
  formatHtml,
  isLocalhostUrl,
  OriginDegradedError,
} from "@pseolint/core";
import type { AuditSummary, Verdict } from "@pseolint/core";
import type { CliFlags } from "./config.js";
import { loadConfig, mergeOptions } from "./config.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

type FormatType = "console" | "json" | "markdown" | "html";

// Verdict ladder for --ci-threshold gating. Lower = better; we exit non-zero
// when the audit's verdict is at or worse than the configured threshold.
const VERDICT_RANK: Record<Verdict, number> = {
  ready: 0,
  caution: 1,
  concerning: 2,
  critical: 3,
};

const VERDICT_LADDER: Verdict[] = ["ready", "caution", "concerning", "critical"];

// Default CI threshold: exit non-zero only on `concerning` or worse.
const DEFAULT_CI_THRESHOLD: Verdict = "concerning";

// Default formatters take a verbose flag. The console formatter additionally
// accepts a noColor flag. The formatter-rewrite agent owns the formatter
// signatures; this CLI passes both flags through and casts at the boundary.
type FormatFn = (summary: AuditSummary, options?: { verbose?: boolean; noColor?: boolean }) => string;

const formatters: Record<FormatType, FormatFn> = {
  console: formatConsole as unknown as FormatFn,
  json: formatJson as unknown as FormatFn,
  markdown: formatMarkdown as unknown as FormatFn,
  html: formatHtml as unknown as FormatFn,
};

interface CliOptions {
  format: FormatType;
  /** Deprecated v0.3 numeric threshold. Replaced by --ci-threshold in v0.4. */
  threshold?: string;
  /** v0.4 verdict-severity threshold. One of: ready | caution | concerning | critical. */
  ciThreshold?: string;
  /** v0.4: when true, console formatter prints all bucketed issues. */
  explain?: boolean;
  /** v0.4: stub for the watch loop (not yet implemented in v0.4.0). */
  watch?: boolean;
  output?: string;
  color: boolean;
  concurrency: string;
  timeout: string;
  sampleSize: string;
  ignore?: string;
  render: boolean;
  browserWs?: string;
  analytics?: string;
  blockHost?: string[];
  safeMode?: string;
  full: boolean;
  /** v0.4 §4.11: bypass site-classification rule suppression — run all rules. */
  strict?: boolean;
  backpressure: boolean;
  respectRobots: boolean;
  respectNoindex: boolean;
  skipDetectedAuth: boolean;
  skipBoilerplate: boolean;
  skipSearchPages: boolean;
  skipEmptyBody: boolean;
  followRedirects: boolean;
  crawl: boolean;
  mcp: boolean;
  dataSource?: string;
  cache?: string | boolean;
  cacheTtl: string;
  cacheMaxMb?: number;
  gitignore: boolean;
  strategy: string;
  maxPerTemplate: string;
  state?: string | boolean;
  since: boolean;
  exitOnRegression: boolean;
  mode?: string;
  ageFloorDays?: number;
  ai?: boolean;
  aiProvider?: string;
  aiModel?: string;
  aiEndpoint?: string;
  aiMaxTokens: number;
  aiMaxCost?: number;
  aiDailyBudget?: number;
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
      "--ci-threshold <severity>",
      "Verdict severity that fails CI: ready | caution | concerning | critical (default: concerning)",
    )
    .option(
      "-t, --threshold <n>",
      "[deprecated] Numeric risk threshold; use --ci-threshold instead",
    )
    .option(
      "--explain",
      "Print every bucketed finding (default view shows verdict + grades + top 3 fixes)",
    )
    .option(
      "--watch",
      "[planned, v0.4.1] Re-audit on source changes (not yet implemented)",
    )
    .option("-o, --output <file>", "Write report to file instead of stdout")
    .option("--no-color", "Disable colored output")
    .option("--concurrency <n>", "Max parallel HTTP fetches", "5")
    .option("--timeout <ms>", "Per-request timeout in ms", "30000")
    .option("--sample-size <n>", "Audit a random subset of N pages", "0")
    .option("--ignore <patterns>", "Comma-separated glob patterns to exclude")
    .option("--render", "Render pages in a browser before auditing")
    .option("--browser-ws <url>", "CDP WebSocket endpoint for browser rendering")
    .option("--analytics <mode>", "Render-mode analytics handling: block | allow | allow-first-party (default: block)", "block")
    .option("--block-host <host>", "Extra host substring to block in render mode (repeatable)", (v, acc: string[]) => [...acc, v], [] as string[])
    .option("--safe-mode <mode>", "Safety preset: saas (guardSsrf + tight caps) | cli (default) | dev (tiny crawl for localhost)")
    .option("--full", "Disable the automatic 'dev' preset for localhost sources — run a full crawl")
    .option("--strict", "Run all rules regardless of detected site type (bypass pSEO-only rule suppression on small sites)")
    .option("--no-backpressure", "Disable the in-flight watchdog that aborts audits when origin latency or 5xx rate spikes")
    .option("--no-respect-robots", "Audit sitemap URLs even if the target's robots.txt Disallows them")
    .option("--no-respect-noindex", "Audit pages marked noindex (via meta robots or X-Robots-Tag) instead of skipping them")
    .option("--skip-detected-auth", "Heuristically detect login/signup/password-reset pages and skip them from rule evaluation")
    .option("--skip-boilerplate", "Skip cookie/legal/consent/imprint pages")
    .option("--skip-search-pages", "Skip pages with search-result URL hallmarks (?q=, /search, etc.)")
    .option("--skip-empty-body", "Skip un-hydrated SPA shells (script-driven pages with empty body)")
    .option("--no-follow-redirects", "Don't follow 3xx redirects — report them as-is")
    .option("--no-crawl", "Disable crawl-based page discovery for URL sources")
    .option("--data-source <file>", "JSON file with source data for content verification")
    .option("--cache [dir]", "Enable HTTP cache (default dir: .pseolint/cache)")
    .option("--cache-ttl <duration>", "Cache TTL for entries without validators, e.g. 7d, 1h, 30m", "7d")
    .option("--cache-max-mb <n>", "Max cache size in MB (evicts oldest after run; 0 = unlimited). Default: 200", (v) => parseInt(v, 10))
    .option("--no-gitignore", "Don't auto-append .pseolint/ to the repo's .gitignore")
    .option("--strategy <random|stratified>", "Sampling strategy when --sample-size is set", "stratified")
    .option("--max-per-template <n>", "Cap samples per URL template cluster", "0")
    .option("--state [path]", "Enable state persistence (default path: .pseolint/state.json)")
    .option("--since", "v0.5+ alias for --mode=monitoring (kept for back-compat; auto-monitoring is the default when prior state exists)")
    .option("--mode <monitoring|fresh>", "v0.5+ change-driven monitoring mode. 'monitoring' applies the pre-fetch decision matrix (default when prior state exists). 'fresh' forces a full re-audit even with prior state.")
    .option("--age-floor-days <n>", "v0.5+ minimum days since a URL's last fetch before monitoring forces a re-fetch regardless of other signals (default: pseolint core's DEFAULT_AGE_FLOOR_DAYS, currently 7)")
    .option("--exit-on-regression", "Exit non-zero when new rule IDs fire vs prior --state")
    .option("--ai", "Enable AI triage of findings")
    .option(
      "--ai-provider <id>",
      "AI provider: anthropic | openai | google | mistral | groq | xai | cohere | ollama (default: auto-detect)",
    )
    .option("--ai-model <name>", "AI model name (overrides provider default)")
    .option("--ai-endpoint <url>", "AI endpoint (Ollama only; default: http://localhost:11434)")
    .option("--ai-max-tokens <n>", "Input token cap per triage call", (v) => parseInt(v, 10), 60000)
    .option("--ai-max-cost <usd>", "Refuse a triage call whose pre-flight cost estimate exceeds this many USD", (v) => parseFloat(v))
    .option("--ai-daily-budget <usd>", "Refuse triage when today's total estimated spend would exceed this USD (requires --telemetry)", (v) => parseFloat(v))
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

  program
    .command("diff <baseline> <current>")
    .description("Diff two AuditSummary JSON reports — verdict + grade deltas, fixed/regressed/new findings")
    .option("--no-color", "Disable colored output")
    .action(async (baselinePath: string, currentPath: string, opts: { color: boolean }) => {
      const { runDiffCommand } = await import("./commands/diff.js");
      exitCode = await runDiffCommand(baselinePath, currentPath, { noColor: !opts.color });
    });

  program
    .command("upload <report>")
    .description("Upload an audit JSON report to the pseolint Pro ingestion endpoint")
    .option("--token <token>", "API token (or PSEOLINT_TOKEN env var)")
    .option("--domain-id <id>", "Domain ID to associate the report with (or PSEOLINT_DOMAIN_ID env var)")
    .option("--endpoint <url>", "Override the API endpoint (or PSEOLINT_ENDPOINT env var)")
    .action(async (report: string, opts: { token?: string; domainId?: string; endpoint?: string }) => {
      const token = opts.token ?? process.env.PSEOLINT_TOKEN;
      const domainId = opts.domainId ?? process.env.PSEOLINT_DOMAIN_ID;
      if (!token || !domainId) {
        process.stderr.write(
          "missing --token or --domain-id (or PSEOLINT_TOKEN / PSEOLINT_DOMAIN_ID)\n",
        );
        process.exit(2);
      }
      try {
        const { uploadCommand } = await import("./commands/upload.js");
        await uploadCommand({ reportPath: report, token, domainId, endpoint: opts.endpoint });
      } catch (err) {
        process.stderr.write(`Error: ${(err as Error).message}\n`);
        process.exit(1);
      }
    });

  const cacheCmd = program
    .command("cache")
    .description("Manage the HTTP fetch cache (.pseolint/cache by default)");

  cacheCmd
    .command("stats")
    .description("Show cache size and file count")
    .option("--dir <path>", "Cache directory", ".pseolint/cache")
    .action(async (opts: { dir: string }) => {
      const { getCacheSizeInfo } = await import("@pseolint/core");
      const info = await getCacheSizeInfo(opts.dir);
      process.stdout.write(
        `${opts.dir}: ${info.fileCount} entries, ${(info.bytes / 1024 / 1024).toFixed(2)} MB\n`,
      );
    });

  cacheCmd
    .command("prune")
    .description("Evict oldest entries until cache is under the size cap")
    .option("--dir <path>", "Cache directory", ".pseolint/cache")
    .option("--max-mb <n>", "Max size in MB (default: 200)", (v) => parseInt(v, 10), 200)
    .action(async (opts: { dir: string; maxMb: number }) => {
      const { pruneCache } = await import("@pseolint/core");
      const result = await pruneCache(opts.dir, opts.maxMb * 1024 * 1024);
      const freedMb = ((result.before.bytes - result.after.bytes) / 1024 / 1024).toFixed(2);
      process.stdout.write(
        `${opts.dir}: freed ${freedMb} MB (${result.removedEntries} entries, ${result.removedTmpFiles} .tmp); size now ${(result.after.bytes / 1024 / 1024).toFixed(2)} MB\n`,
      );
    });

  cacheCmd
    .command("clear")
    .description("Delete every entry in the cache directory")
    .option("--dir <path>", "Cache directory", ".pseolint/cache")
    .action(async (opts: { dir: string }) => {
      const { clearCache } = await import("@pseolint/core");
      const { removed } = await clearCache(opts.dir);
      process.stdout.write(`${opts.dir}: cleared ${removed} entries\n`);
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

  if (opts.watch) {
    process.stderr.write(
      "pseolint: watch mode not yet implemented in v0.4.0; coming in v0.4.1.\n",
    );
    return 0;
  }

  // Resolve verdict-severity threshold for CI gating (v0.4).
  // --ci-threshold takes precedence; --threshold is the deprecated numeric alias.
  let ciThreshold: Verdict = DEFAULT_CI_THRESHOLD;
  let legacyRiskThreshold: number | null = null;
  if (opts.ciThreshold !== undefined) {
    if (!isVerdict(opts.ciThreshold)) {
      console.error(
        `Error: --ci-threshold must be one of: ${VERDICT_LADDER.join(" | ")}, got "${opts.ciThreshold}"`,
      );
      return 1;
    }
    ciThreshold = opts.ciThreshold;
  }
  if (opts.threshold !== undefined) {
    process.stderr.write(
      `warning: --threshold is deprecated, use --ci-threshold ${ciThreshold} instead\n`,
    );
    const parsed = Number(opts.threshold);
    if (Number.isNaN(parsed)) {
      console.error(`Error: --threshold must be a number, got "${opts.threshold}"`);
      return 1;
    }
    legacyRiskThreshold = parsed;
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
    render: opts.render
      ? {
          browserWsEndpoint: opts.browserWs,
          analyticsMode:
            opts.analytics === "allow" || opts.analytics === "allow-first-party"
              ? opts.analytics
              : "block",
          extraBlockedHosts: opts.blockHost && opts.blockHost.length > 0 ? opts.blockHost : undefined,
        }
      : undefined,
    crawlDiscovery: opts.crawl === false ? false : undefined,
    samplingStrategy: opts.strategy === "random" ? "random" : "stratified",
    maxPerTemplate: opts.maxPerTemplate !== "0" ? Number(opts.maxPerTemplate) : undefined,
    safeMode: opts.safeMode === "saas" || opts.safeMode === "cli" || opts.safeMode === "dev" ? opts.safeMode : undefined,
    autoDevPreset: opts.full ? false : undefined,
    backpressure: opts.backpressure === false ? false : undefined,
    respectRobotsTxt: opts.respectRobots === false ? false : undefined,
    respectNoindex: opts.respectNoindex === false ? false : undefined,
    skipDetectedAuth: opts.skipDetectedAuth === true ? true : undefined,
    skipBoilerplate: opts.skipBoilerplate === true ? true : undefined,
    skipSearchPages: opts.skipSearchPages === true ? true : undefined,
    skipEmptyBody: opts.skipEmptyBody === true ? true : undefined,
    followRedirects: opts.followRedirects === false ? false : undefined,
    strict: opts.strict === true ? true : undefined,
  };

  if (opts.cache) {
    try {
      const maxBytes = typeof opts.cacheMaxMb === "number" && Number.isFinite(opts.cacheMaxMb)
        ? opts.cacheMaxMb * 1024 * 1024
        : undefined;
      cliFlags.cache = {
        dir: typeof opts.cache === "string" ? opts.cache : undefined,
        ttlMs: parseDuration(opts.cacheTtl),
        ...(maxBytes !== undefined && { maxBytes }),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      return 1;
    }
  }

  if ((opts.since || opts.exitOnRegression || opts.mode) && !opts.state) {
    console.error("Error: --since, --mode, and --exit-on-regression require --state to be set");
    return 1;
  }

  if (opts.mode !== undefined && opts.mode !== "monitoring" && opts.mode !== "fresh") {
    console.error(`Error: --mode must be 'monitoring' or 'fresh', got '${opts.mode}'`);
    return 1;
  }

  let ageFloorDaysParsed: number | undefined;
  if (opts.ageFloorDays !== undefined) {
    const n = Number(opts.ageFloorDays);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      console.error(`Error: --age-floor-days must be a positive integer, got '${opts.ageFloorDays}'`);
      return 1;
    }
    ageFloorDaysParsed = n;
  }

  if (opts.state || opts.since || opts.exitOnRegression || opts.mode) {
    cliFlags.state = {
      path: typeof opts.state === "string" ? opts.state : undefined,
      since: Boolean(opts.since),
      exitOnRegression: Boolean(opts.exitOnRegression),
      ...(opts.mode ? { mode: opts.mode as "monitoring" | "fresh" } : {}),
      ...(ageFloorDaysParsed !== undefined ? { ageFloorDays: ageFloorDaysParsed } : {}),
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
      maxCostUsd: Number.isFinite(opts.aiMaxCost) ? opts.aiMaxCost : undefined,
      dailyBudgetUsd: Number.isFinite(opts.aiDailyBudget) ? opts.aiDailyBudget : undefined,
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

  // v0.4.1: only emit per-pattern unmatched-ignore warnings when the user
  // explicitly passed `--ignore` on the CLI. Patterns inherited from
  // pseolint.config.ts often include broad safety lists (e.g.
  // `**/dashboard/**`) that legitimately don't match a small marketing site;
  // warning per pattern was noisy. The all-zero consolidated warning still
  // fires regardless (catches genuine typos like `*.json` vs `**/*.json`).
  const cliPassedIgnore = opts.ignore != null;
  if (cliPassedIgnore) {
    options.warnUnmatchedIgnore = true;
  }

  // Localhost ergonomics: a cache-cold first run against `http://localhost`
  // can thundering-herd a dev server's DB. Two mitigations — both opt-out:
  //   1) auto-promote to the "dev" safeMode preset (tiny crawl budget)
  //   2) default-on cache so re-runs are cheap and idempotent
  const sourceLooksLocalhost = isLocalhostUrl(source);
  const devPresetWillApply =
    sourceLooksLocalhost &&
    options.safeMode === undefined &&
    options.autoDevPreset !== false;
  if (devPresetWillApply) {
    console.error(
      "pseolint: localhost detected — applying 'dev' preset (concurrency=1, sampleSize=25, maxCrawlDiscovered=50). Override with --full or --safe-mode cli.",
    );
  }
  if (sourceLooksLocalhost && !opts.cache && options.cache === undefined) {
    // Opt-in by default for localhost only. We don't flip this for public
    // sources because users expect `--cache` to be explicit there.
    try {
      const defaultCache = { ttlMs: parseDuration(opts.cacheTtl) };
      options.cache = defaultCache;
      cliFlags.cache = defaultCache;
      console.error("pseolint: localhost detected — HTTP cache enabled by default (clear .pseolint/cache to force a cold run).");
    } catch {
      // parseDuration already validated at --cache path; swallow here.
    }
  }

  // When this run will produce files under `.pseolint/`, make sure the repo's
  // .gitignore covers it. Prevents users accidentally committing 1 GB+ of
  // cached HTML on pSEO sites. Opt-out via `--no-gitignore`.
  const willWriteUnderPseolint =
    Boolean(cliFlags.cache) ||
    Boolean(cliFlags.state) ||
    Boolean(cliFlags.telemetry?.enabled || cliFlags.telemetry?.path) ||
    (cliFlags.ai?.enabled === true && cliFlags.ai?.cache !== false);
  if (willWriteUnderPseolint && opts.gitignore !== false) {
    try {
      const { ensurePseolintGitignored } = await import("./ensure-gitignore.js");
      const result = await ensurePseolintGitignored(process.cwd());
      if (result.modified) {
        console.error(`pseolint: added .pseolint/ to ${result.gitignorePath} (disable via --no-gitignore)`);
      }
    } catch {
      // Non-fatal: gitignore tweak must never block an audit.
    }
  }

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

  // SIGINT (ctrl-C) triggers a clean abort — in-flight fetches cancel and the
  // audit throws AbortError instead of the process being hard-killed mid-fetch
  // with the stream half-read. Second SIGINT within ~1s forces immediate exit.
  const abortController = new AbortController();
  let sigintCount = 0;
  const sigintHandler = (): void => {
    sigintCount += 1;
    if (sigintCount === 1) {
      console.error("\npseolint: received SIGINT, aborting audit (ctrl-C again to force exit)...");
      abortController.abort(new Error("Aborted by SIGINT"));
    } else {
      console.error("pseolint: forcing exit.");
      process.exit(130);
    }
  };
  process.on("SIGINT", sigintHandler);

  // Run audit
  let summary;
  try {
    summary = await auditSource(source, { ...options, signal: options.signal ?? abortController.signal });
  } catch (err) {
    if (err instanceof OriginDegradedError) {
      console.error(
        `\npseolint: aborted — origin looks degraded.\n` +
        `  ${err.message}\n` +
        `  Options: wait for the origin to recover, re-run with --concurrency 1, ` +
        `or run --no-backpressure to override (not recommended on production DBs).`,
      );
      return 1;
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    return 1;
  } finally {
    process.off("SIGINT", sigintHandler);
  }

  if (summary.cacheStats && summary.cacheStats.total > 0) {
    const { hits, total, bytesSavedEstimate } = summary.cacheStats;
    const mb = (bytesSavedEstimate / (1024 * 1024)).toFixed(2);
    console.error(`Cache: ${hits}/${total} hits (${mb} MB saved)`);
  }

  if (summary.scrapePlan) {
    const sp = summary.scrapePlan;
    const total = sp.intended + sp.carriedForward;
    const refetchReasons = Object.entries(sp.reasonCounts)
      .filter(([k]) => k !== "unchanged")
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    const reasonSuffix = refetchReasons ? ` (${refetchReasons})` : "";
    // Show "fetched / intended" when downstream filters dropped some URLs the
    // matrix wanted to refetch (robots, byte budget, content-type, 4xx).
    // When fetched === intended (the common case) this collapses to the
    // simpler "X URLs re-scraped" form.
    const fetchedDisplay = sp.fetched === sp.intended
      ? `${sp.fetched}`
      : `${sp.fetched}/${sp.intended} (intended)`;
    console.error(
      `Monitoring: ${fetchedDisplay}/${total} URLs re-scraped${reasonSuffix}, ${sp.carriedForward} carried forward.`,
    );
  }

  // Format output. The console formatter accepts noColor + verbose; non-console
  // formatters accept verbose. The formatter-rewrite agent owns these signatures.
  const verbose = Boolean(opts.explain);
  const output = format === "console"
    ? (formatConsole as unknown as FormatFn)(summary, { noColor: !opts.color, verbose })
    : formatters[format](summary, { verbose });

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

  // Exit code based on verdict severity (v0.4) + regression.
  // Default: --ci-threshold concerning → exit 1 if verdict is concerning or critical.
  let exitCode = 0;
  const verdictRank = VERDICT_RANK[summary.verdict];
  const thresholdRank = VERDICT_RANK[ciThreshold];
  if (verdictRank >= thresholdRank) {
    exitCode = 1;
  }
  // Legacy --threshold alias: gates on summary.risk >= n (low risk = good).
  if (legacyRiskThreshold !== null && summary.risk >= legacyRiskThreshold) {
    exitCode = Math.max(exitCode, 1);
  }
  if (summary.hasRegression) {
    console.error("Regression detected: new rule IDs fired vs prior state");
    exitCode = Math.max(exitCode, 1);
  }
  return exitCode;
}

function isVerdict(v: string): v is Verdict {
  return (VERDICT_LADDER as string[]).includes(v);
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
  lines.push(`  ${pad("Attempts")}:  ${stats.triageAttempts}`);
  lines.push(`  ${pad("Successful")}:  ${stats.triageUsed}`);
  lines.push(`  ${pad("Success rate")}:  ${formatPct(stats.triageUsed, stats.triageAttempts)}`);
  lines.push(`  ${pad("Cache hit rate")}:  ${formatPct(stats.triageCacheHits, stats.triageUsed)}`);
  for (const [reason, count] of Object.entries(stats.triageSkipReasons)) {
    lines.push(`  ${pad(`  skip: ${reason}`)}:  ${count}`);
  }
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

// Direct execution: compare real paths so global bins / npm link symlinks match import.meta.url
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const thisFile = realpathSync(fileURLToPath(import.meta.url));
    const mainFile = realpathSync(entry);
    return thisFile === mainFile;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  runCli().then((code) => {
    process.exit(code);
  });
}
