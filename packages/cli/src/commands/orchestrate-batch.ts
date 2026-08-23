import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { orchestrate, type SessionEvent } from "@pseolint/core";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

export interface BatchCliOptions {
  sitesPath: string;
  outDir: string;
  maxCostUsd: number;
  maxToolCalls: number;
  maxWallSeconds: number;
  concurrency: number;
  dryRun: boolean;
  noColor?: boolean;
}

interface SiteResult {
  domain: string;
  slug: string;
  ok: boolean;
  reason: string | null;
  spentUsd: number;
  durationSeconds: number;
  toolCallCount: number;
  verdict: string | null;
  pagePatchCount: number;
  templatePatchCount: number;
  domainPatchCount: number;
  validPatches: number;
  totalPatches: number;
  error?: string;
}

function paint(s: string, color: string, strip: boolean): string {
  return strip ? s : `${color}${s}${RESET}`;
}

async function loadSites(path: string): Promise<string[]> {
  const text = await readFile(path, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

function slugFor(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").replace(/[^a-z0-9.-]/gi, "_");
  } catch {
    return url.replace(/[^a-z0-9.-]/gi, "_").slice(0, 60);
  }
}

async function runOne(
  domain: string,
  opts: BatchCliOptions,
  strip: boolean,
): Promise<SiteResult> {
  const slug = slugFor(domain);
  const outDir = join(opts.outDir, slug);
  await mkdir(outDir, { recursive: true });

  const stream = process.stdout;
  stream.write("\n" + paint(`▶ ${domain}`, BOLD + CYAN, strip) + paint(`  (slug: ${slug})`, DIM, strip) + "\n");
  const startedAt = Date.now();

  try {
    const result = await orchestrate({
      domain,
      userId: "batch",
      budget: {
        maxSessionUsd: opts.maxCostUsd,
        maxToolCalls: opts.maxToolCalls,
        maxWallSeconds: opts.maxWallSeconds,
      },
      ndjsonPath: join(outDir, "session.ndjson"),
      onEvent: (e: SessionEvent) => {
        // Concise progress markers: one char per event family.
        if (e.kind === "tool_call") stream.write(paint(".", DIM, strip));
        if (e.kind === "tool_result" && (e.result as { ok?: boolean })?.ok === false) {
          stream.write(paint("x", RED, strip));
        }
        if (e.kind === "session_finished") {
          const reasonColor = e.reason === "completed" ? GREEN : YELLOW;
          stream.write(
            "\n  " +
              paint(
                `→ ${e.reason} · ${e.usage.toolCallCount} calls · $${e.usage.estimatedUsd.toFixed(3)} · ${(e.usage.elapsedMs / 1000).toFixed(0)}s`,
                reasonColor + BOLD,
                strip,
              ) +
              "\n",
          );
        }
      },
    });

    if (result.manifest && result.validation && result.diff) {
      await writeFile(
        join(outDir, "manifest.json"),
        JSON.stringify(
          { manifest: result.manifest, validation: result.validation, diff: result.diff },
          null,
          2,
        ),
        "utf8",
      );
    }

    return {
      domain,
      slug,
      ok: result.session.reason === "completed",
      reason: result.session.reason,
      spentUsd: result.session.usage.estimatedUsd,
      durationSeconds: result.session.usage.elapsedMs / 1000,
      toolCallCount: result.session.usage.toolCallCount,
      verdict: result.manifest?.verdict ?? null,
      pagePatchCount: result.manifest?.pages.length ?? 0,
      templatePatchCount: result.manifest?.templates.length ?? 0,
      domainPatchCount: result.manifest?.domainLevel.length ?? 0,
      validPatches: result.validation?.validPatches ?? 0,
      totalPatches: result.validation?.totalPatches ?? 0,
      error: result.session.error,
    };
  } catch (e) {
    const elapsed = (Date.now() - startedAt) / 1000;
    stream.write("\n  " + paint(`× failed: ${e instanceof Error ? e.message : String(e)}`, RED, strip) + "\n");
    return {
      domain,
      slug,
      ok: false,
      reason: "thrown_error",
      spentUsd: 0,
      durationSeconds: elapsed,
      toolCallCount: 0,
      verdict: null,
      pagePatchCount: 0,
      templatePatchCount: 0,
      domainPatchCount: 0,
      validPatches: 0,
      totalPatches: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function buildMarkdownSummary(results: SiteResult[], opts: BatchCliOptions): string {
  const totalSpend = results.reduce((acc, r) => acc + r.spentUsd, 0);
  const totalDuration = results.reduce((acc, r) => acc + r.durationSeconds, 0);
  const completed = results.filter((r) => r.ok).length;
  const totalPatches = results.reduce((acc, r) => acc + r.totalPatches, 0);
  const validPatches = results.reduce((acc, r) => acc + r.validPatches, 0);

  const lines: string[] = [];
  lines.push("# pseolint orchestrator: batch run");
  lines.push("");
  lines.push(
    `**${results.length} sites** · **${completed} completed** · **$${totalSpend.toFixed(2)} total** · **${(totalDuration / 60).toFixed(1)} min wall** · **${validPatches}/${totalPatches} patches validated**`,
  );
  lines.push("");
  lines.push(`Budget per site: $${opts.maxCostUsd} · ${opts.maxToolCalls} tool calls · ${opts.maxWallSeconds}s wall`);
  lines.push("");
  lines.push("| Domain | Status | Verdict | Patches (valid/total) | Cost | Tool calls | Duration |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of results) {
    const patches = `${r.validPatches}/${r.totalPatches}`;
    lines.push(
      `| \`${r.domain}\` | ${r.ok ? "✅ completed" : `❌ ${r.reason}`} | ${r.verdict ?? "—"} | ${patches} | $${r.spentUsd.toFixed(3)} | ${r.toolCallCount} | ${r.durationSeconds.toFixed(0)}s |`,
    );
  }
  lines.push("");
  lines.push("Generated by `pseolint orchestrate-batch` · per-site manifests under each `<slug>/manifest.json`.");
  return lines.join("\n");
}

/**
 * Run `orchestrate()` against a list of domains, emit aggregate stats +
 * per-site manifest JSON files. Sequential by default: concurrency > 1
 * burns money fast on rate-limit errors. Failures on individual sites
 * don't abort the batch; they're recorded in `summary.json` with their
 * reason.
 *
 * Output layout (under `--out`, default `.pseolint/batch`):
 *   summary.json: aggregate metrics across all sites
 *   summary.md: markdown table for the launch thread
 *   <slug>/manifest.json: full {manifest, validation, diff}
 *   <slug>/session.ndjson: durable event log
 */
export async function runOrchestrateBatchCommand(opts: BatchCliOptions): Promise<number> {
  const strip = opts.noColor ?? !process.stdout.isTTY;
  const stream = process.stdout;

  let sites: string[];
  try {
    sites = await loadSites(opts.sitesPath);
  } catch (e) {
    process.stderr.write(`Could not read ${opts.sitesPath}: ${e instanceof Error ? e.message : String(e)}\n`);
    return 2;
  }

  stream.write(paint(`Loaded ${sites.length} sites from ${opts.sitesPath}`, BOLD, strip) + "\n");
  stream.write(paint(`Output: ${opts.outDir}`, DIM, strip) + "\n");
  stream.write(
    paint(
      `Budget: $${opts.maxCostUsd} per site · ${opts.maxToolCalls} tool calls · ${opts.maxWallSeconds}s wall · concurrency ${opts.concurrency}`,
      DIM,
      strip,
    ) + "\n",
  );

  if (opts.dryRun) {
    stream.write("\n--dry-run set: would run on:\n");
    for (const s of sites) stream.write(`  ${s}\n`);
    return 0;
  }

  await mkdir(opts.outDir, { recursive: true });

  const results: SiteResult[] = [];
  if (opts.concurrency <= 1) {
    for (const site of sites) {
      results.push(await runOne(site, opts, strip));
    }
  } else {
    let cursor = 0;
    const next = async (): Promise<void> => {
      const i = cursor++;
      if (i >= sites.length) return;
      const r = await runOne(sites[i], opts, strip);
      results.push(r);
      await next();
    };
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(opts.concurrency, sites.length); i++) {
      workers.push(next());
    }
    await Promise.all(workers);
    // Worker-pool may reorder; sort to match input order for the summary.
    const order = new Map(sites.map((s, i) => [s, i]));
    results.sort((a, b) => (order.get(a.domain) ?? 0) - (order.get(b.domain) ?? 0));
  }

  await writeFile(
    join(opts.outDir, "summary.json"),
    JSON.stringify({ opts, results }, null, 2),
    "utf8",
  );
  await writeFile(
    join(opts.outDir, "summary.md"),
    buildMarkdownSummary(results, opts),
    "utf8",
  );

  const completed = results.filter((r) => r.ok).length;
  const totalSpend = results.reduce((acc, r) => acc + r.spentUsd, 0);
  stream.write("\n");
  stream.write(
    paint(
      `Done: ${completed}/${results.length} completed · total spend $${totalSpend.toFixed(2)}`,
      BOLD + (completed === results.length ? GREEN : YELLOW),
      strip,
    ) + "\n",
  );
  stream.write(paint(`Wrote ${join(opts.outDir, "summary.md")}`, DIM, strip) + "\n");

  // Exit non-zero if any site didn't complete; useful for CI batch runs.
  return completed === results.length ? 0 : 1;
}
