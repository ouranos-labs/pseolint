import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

export const STATE_SCHEMA_VERSION = 1;

export type RenderMode = "static" | "rendered";

export interface UrlStateEntry {
  contentHash: string;
  fetchedAt: string;
  status: number;
  findingIds: string[];
}

export interface RunState {
  version: number;
  lastRun: string;
  source: string;
  renderMode: RenderMode;
  urls: Record<string, UrlStateEntry>;
  summary: {
    score: number;
    totalFindings: number;
    byCategory: Record<string, number>;
  };
}

/**
 * Normalize HTML so content hashing is stable across irrelevant diffs.
 *
 * Strips: HTML comments, script bodies, style bodies, whitespace runs.
 *
 * Known limitations (use as "likely-unchanged" signal, not proof):
 * - Attribute order changes are NOT normalized (regex parser, not DOM)
 * - Inline event handlers and `data-*` attributes with dynamic values
 *   (nonces, CSRF tokens) will produce different hashes
 */
export function normalizeHtmlForHash(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "<script></script>")
    .replace(/<style[\s\S]*?<\/style>/gi, "<style></style>")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeContentHash(html: string): string {
  const norm = normalizeHtmlForHash(html);
  return "sha256:" + createHash("sha256").update(norm).digest("hex");
}

export async function readState(path: string): Promise<RunState | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`state file at ${path} is not valid JSON: ${(e as Error).message}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`state file at ${path} is not an object`);
  }
  const state = parsed as RunState;
  if (state.version !== STATE_SCHEMA_VERSION) {
    throw new Error(
      `unsupported state version ${state.version} at ${path}, expected ${STATE_SCHEMA_VERSION}`
    );
  }
  if (typeof state.lastRun !== "string" ||
      typeof state.source !== "string" ||
      typeof state.renderMode !== "string" ||
      !state.urls || typeof state.urls !== "object" ||
      !state.summary || typeof state.summary !== "object") {
    throw new Error(`state file at ${path} has malformed shape`);
  }
  return state;
}

export async function writeState(path: string, state: RunState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await rename(tmp, path);
}
