import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, sep } from "node:path";
import {
  renderManifest,
  applyEditToContent,
  manifestSchema,
  type FileEdit,
  type ChecklistItem,
  type TemplateMapping,
} from "@pseolint/core";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

export interface ApplyCliOptions {
  /** Path to a manifest JSON (raw manifest, or the `{ manifest, ... }` wrapper written by --manifest-out). */
  manifestPath: string;
  /** Repo root to apply edits into. Default cwd. */
  repo: string;
  /** Template→source mapping JSON. Default `<repo>/.pseolint/templates.json`. */
  mappingPath?: string;
  /** Print what would change without writing. */
  dryRun?: boolean;
  noColor?: boolean;
}

/** Result of applying a manifest — consumed by the printer and (Slice 2) the PR opener. */
export type ApplyResult =
  | { ok: false; error: string; hint?: string }
  | {
      ok: true;
      /** The audited domain (drives the PR branch/title in `--pr`). */
      domain: string;
      /** Repo-relative paths written (empty on dry-run-would-write is still populated). */
      changedFiles: string[];
      /** Count of edits successfully applied. */
      applied: number;
      /** Everything a human still has to do: manifest checklist + demoted misses. */
      checklist: ChecklistItem[];
      dryRun: boolean;
    };

function paint(s: string, color: string, strip: boolean): string {
  return strip ? s : `${color}${s}${RESET}`;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

/** Resolve an edit's repo-relative path, refusing anything that escapes the repo root. */
function safeResolve(repoRoot: string, p: string): string | null {
  const abs = resolve(repoRoot, p);
  if (abs !== repoRoot && !abs.startsWith(repoRoot + sep)) return null;
  return abs;
}

/**
 * Apply a fix manifest's deterministic edits into a working tree. Pure of any
 * printing/exit — returns a structured result so both the CLI printer and the
 * PR opener (`apply --pr`) can consume it. Interpolated-template misses demote
 * to the checklist rather than corrupting source. No GitHub, no network.
 */
export async function applyManifest(opts: ApplyCliOptions): Promise<ApplyResult> {
  const repoRoot = resolve(opts.repo);
  const mappingPath = opts.mappingPath ?? resolve(repoRoot, ".pseolint/templates.json");

  // 1. Load + validate the manifest (accepts raw or the --manifest-out wrapper).
  let raw: unknown;
  try {
    raw = await readJson(opts.manifestPath);
  } catch (e) {
    return { ok: false, error: `cannot read manifest ${opts.manifestPath}: ${(e as Error).message}` };
  }
  const candidate =
    raw && typeof raw === "object" && "manifest" in raw ? (raw as { manifest: unknown }).manifest : raw;
  const parsed = manifestSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: `${opts.manifestPath} is not a valid manifest: ${parsed.error.issues[0]?.message}` };
  }

  // 2. Load the template→source mapping.
  let mapping: TemplateMapping;
  try {
    const m = await readJson(mappingPath);
    if (!m || typeof m !== "object" || Array.isArray(m)) throw new Error("must be a JSON object of route → path");
    mapping = m as TemplateMapping;
  } catch (e) {
    return {
      ok: false,
      error: `cannot read mapping ${mappingPath}: ${(e as Error).message}`,
      hint: `create it, e.g. { "/listing/:slug": "app/listing/[slug]/page.tsx" }`,
    };
  }

  // 3. Render into applicable edits + checklist.
  const { edits, checklist } = renderManifest(parsed.data, mapping);

  // 4. Apply edits file-by-file (grouped so multiple edits share one read/write).
  const byPath = new Map<string, FileEdit[]>();
  for (const e of edits) {
    const list = byPath.get(e.path) ?? [];
    list.push(e);
    byPath.set(e.path, list);
  }

  let applied = 0;
  const changedFiles: string[] = [];
  const demoted: ChecklistItem[] = [];

  for (const [relPath, fileEdits] of byPath) {
    const abs = safeResolve(repoRoot, relPath);
    if (!abs) {
      for (const e of fileEdits) demoted.push(editToChecklist(e, `path escapes repo root: ${relPath}`));
      continue;
    }

    let content: string | null;
    try {
      content = await readFile(abs, "utf8");
    } catch {
      content = null; // missing file — only whole-file creates (find === null) can proceed
    }

    let working = content ?? "";
    let fileTouched = false;
    for (const e of fileEdits) {
      if (content === null && e.find !== null) {
        demoted.push(editToChecklist(e, `source file not found: ${relPath}`));
        continue;
      }
      const r = applyEditToContent(working, e);
      if (r.applied) {
        working = r.content;
        fileTouched = true;
        applied += 1;
      } else {
        // Literal absent — almost always an interpolated template. Hand it to the human.
        demoted.push(editToChecklist(e, `literal not found in ${relPath} (interpolated template?)`));
      }
    }

    if (fileTouched && working !== content) {
      changedFiles.push(relPath);
      if (!opts.dryRun) {
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, working, "utf8");
      }
    }
  }

  return {
    ok: true,
    domain: parsed.data.domain,
    changedFiles,
    applied,
    checklist: [...checklist, ...demoted],
    dryRun: opts.dryRun ?? false,
  };
}

/**
 * `pseolint apply` — run {@link applyManifest} and render the result to stdout,
 * returning a process exit code. The human reviews + commits the diff.
 */
export async function runApplyCommand(opts: ApplyCliOptions): Promise<number> {
  const strip = opts.noColor ?? !process.stdout.isTTY;
  const out = process.stdout;

  const result = await applyManifest(opts);
  if (!result.ok) {
    out.write(paint(`✗ ${result.error}\n`, RED, strip));
    if (result.hint) out.write(paint(`  ${result.hint}\n`, DIM, strip));
    return 1;
  }

  const { changedFiles, applied: appliedCount, checklist: allChecklist, dryRun } = result;

  // Report.
  const verb = dryRun ? "would apply" : "applied";
  out.write(paint(`── Edits ───────────────────────────────\n`, BOLD, strip));
  out.write(`  ${verb} ${appliedCount} edit${appliedCount === 1 ? "" : "s"} across ${changedFiles.length} file${changedFiles.length === 1 ? "" : "s"}\n`);
  for (const f of changedFiles) out.write(paint(`    ${dryRun ? "~" : "✓"} ${f}\n`, GREEN, strip));
  if (dryRun && changedFiles.length > 0) {
    out.write(paint(`  (dry run — nothing written; re-run without --dry-run to apply)\n`, DIM, strip));
  }

  if (allChecklist.length > 0) {
    out.write("\n" + paint(`── Checklist (${allChecklist.length} — needs a human) ──\n`, BOLD, strip));
    for (const c of allChecklist) {
      const where = c.path ? paint(` [${c.path}]`, DIM, strip) : c.url ? paint(` [${c.url}]`, DIM, strip) : "";
      out.write(paint(`  • `, YELLOW, strip) + paint(`${c.kind}`, CYAN, strip) + `: ${c.title}${where}\n`);
      if (c.reason) out.write(paint(`      ${c.reason}\n`, DIM, strip));
    }
  }

  if (appliedCount === 0 && allChecklist.length === 0) {
    out.write(paint(`\n  Nothing to do — manifest had no actionable patches.\n`, DIM, strip));
  }

  return 0;
}

function editToChecklist(e: FileEdit, why: string): ChecklistItem {
  return {
    kind: "unmapped",
    path: e.path,
    url: e.url,
    title: `Apply ${e.field} manually — ${why}`,
    detail: e.find === null ? e.replace : `Before: ${e.find}\nAfter: ${e.replace}`,
    reason: e.reason,
  };
}
