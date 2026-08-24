import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { orchestrate, type SessionEvent } from "@pseolint/core";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

export interface OrchestrateCliOptions {
  domain: string;
  aiProvider?: string;
  aiModel?: string;
  aiKey?: string;
  maxCostUsd?: number;
  maxToolCalls?: number;
  maxWallSeconds?: number;
  watchdogIntervalCalls?: number;
  ndjsonPath?: string;
  manifestOut?: string;
  noColor?: boolean;
  quiet?: boolean;
}

function paint(s: string, color: string, strip: boolean): string {
  return strip ? s : `${color}${s}${RESET}`;
}

function summarize(value: unknown, max = 80): string {
  if (value === null || value === undefined) return String(value);
  let s: string;
  try {
    s = typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  s = s.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/**
 * Pretty-print a single SessionEvent to stdout. Designed for live streaming
 * during a session: each event ends with a newline and uses ANSI colors
 * by default (strippable via `noColor`).
 */
function renderEvent(event: SessionEvent, strip: boolean): string {
  switch (event.kind) {
    case "session_started":
      return paint(`◆ session ${event.sessionId.slice(0, 8)}: ${event.domain}`, BOLD + CYAN, strip);
    case "tool_call":
      return paint(`→ ${event.toolName}`, CYAN, strip) + " " +
        paint(summarize(event.input, 100), DIM, strip);
    case "tool_result": {
      const out = event.result as { ok?: boolean; error?: string } | unknown;
      const isErr = typeof out === "object" && out !== null && (out as { ok?: boolean }).ok === false;
      if (isErr) {
        const err = (out as { error?: string }).error ?? "error";
        return paint(`✗ ${event.toolName}`, RED, strip) + " " +
          paint(summarize(err, 100), DIM, strip);
      }
      return paint(`✓ ${event.toolName}`, GREEN, strip);
    }
    case "thought":
      return paint(`  ${summarize(event.text, 200)}`, DIM, strip);
    case "step_usage":
      return paint(
        `  · step: ${event.inputTokens}in/${event.outputTokens}out tokens` +
          ` · $${event.estimatedUsd.toFixed(4)}` +
          (event.durationMs !== undefined ? ` · ${event.durationMs}ms` : ""),
        DIM,
        strip,
      );
    case "watchdog_injected":
      return paint(`⏰ watchdog @ ${event.toolCallCount} tool calls`, MAGENTA, strip);
    case "budget_warning":
      return paint(`⚠ budget breach: ${event.reason}`, YELLOW + BOLD, strip);
    case "session_finished":
      return paint(
        `◆ finished: ${event.reason}` +
          ` · ${event.usage.toolCallCount} tool calls` +
          ` · $${event.usage.estimatedUsd.toFixed(4)}` +
          ` · ${(event.usage.elapsedMs / 1000).toFixed(1)}s`,
        BOLD + (event.reason === "completed" ? GREEN : YELLOW),
        strip,
      );
  }
}

/**
 * Run the orchestrator from the CLI. Streams events live, then prints a
 * summary block (manifest stats + validation failures + diff overview) at
 * the end. Exits 0 on `completed` with all patches valid; non-zero
 * otherwise.
 */
export async function runOrchestrateCommand(opts: OrchestrateCliOptions): Promise<number> {
  const strip = opts.noColor ?? !process.stdout.isTTY;
  const stream = process.stdout;

  const onEvent = opts.quiet
    ? undefined
    : async (event: SessionEvent) => {
        stream.write(renderEvent(event, strip) + "\n");
      };

  const result = await orchestrate({
    domain: opts.domain,
    userId: "cli",
    ai: {
      provider: opts.aiProvider,
      model: opts.aiModel,
      apiKey: opts.aiKey,
    },
    budget: {
      ...(opts.maxCostUsd !== undefined ? { maxSessionUsd: opts.maxCostUsd } : {}),
      ...(opts.maxToolCalls !== undefined ? { maxToolCalls: opts.maxToolCalls } : {}),
      ...(opts.maxWallSeconds !== undefined ? { maxWallSeconds: opts.maxWallSeconds } : {}),
      ...(opts.watchdogIntervalCalls !== undefined
        ? { watchdogIntervalCalls: opts.watchdogIntervalCalls }
        : {}),
    },
    ndjsonPath: opts.ndjsonPath,
    onEvent,
  });

  // Summary block
  stream.write("\n");
  if (result.manifest && result.validation && result.diff) {
    stream.write(paint("── Manifest ───────────────────────────", BOLD, strip) + "\n");
    stream.write(`  verdict: ${result.manifest.verdict}\n`);
    stream.write(
      `  categories: integrity=${result.manifest.categories.integrity}` +
        ` discoverability=${result.manifest.categories.discoverability}` +
        ` citation=${result.manifest.categories.citation}` +
        ` data=${result.manifest.categories.data}\n`,
    );
    stream.write(`  pages: ${result.manifest.pages.length}\n`);
    stream.write(`  templates: ${result.manifest.templates.length}\n`);
    stream.write(`  domain-level: ${result.manifest.domainLevel.length}\n`);

    stream.write("\n" + paint("── Validation ──────────────────────────", BOLD, strip) + "\n");
    const v = result.validation;
    stream.write(
      `  ${v.validPatches}/${v.totalPatches} patches valid` +
        (v.failures.length > 0 ? paint(` (${v.failures.length} dropped)`, YELLOW, strip) : "") +
        "\n",
    );
    for (const f of v.failures.slice(0, 10)) {
      const loc =
        f.location.kind === "page_patch"
          ? `${f.location.pageUrl}#${f.location.patchType}`
          : f.location.kind === "template_patch"
            ? `${f.location.templateId}#${f.location.patchType}`
            : `${f.location.patchType} (domain)`;
      stream.write(paint(`    × ${loc}: ${f.reason}`, RED, strip) + "\n");
    }
    if (v.failures.length > 10) {
      stream.write(paint(`    … and ${v.failures.length - 10} more`, DIM, strip) + "\n");
    }
  } else {
    stream.write(
      paint(
        `No manifest produced (reason: ${result.session.reason}` +
          (result.session.error ? `: ${result.session.error}` : "") +
          ")",
        YELLOW,
        strip,
      ) + "\n",
    );
  }

  if (opts.manifestOut && result.manifest) {
    await mkdir(dirname(opts.manifestOut), { recursive: true });
    await writeFile(
      opts.manifestOut,
      JSON.stringify({ manifest: result.manifest, validation: result.validation, diff: result.diff }, null, 2),
      "utf8",
    );
    stream.write(`\n  wrote ${opts.manifestOut}\n`);
  }

  // Exit code: 0 on completed + all patches valid, non-zero otherwise.
  if (result.session.reason !== "completed") return 1;
  if (result.validation && result.validation.failures.length > 0) return 2;
  return 0;
}
