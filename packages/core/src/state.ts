import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

export const STATE_SCHEMA_VERSION = 2;

export type RenderMode = "static" | "rendered";

/**
 * Permissive snapshot of a finding stored in state for carry-forward across
 * delta runs. The canonical Finding type lives in types.ts; state intentionally
 * accepts a wider shape so we can persist whatever fields the engine emitted at
 * audit time without coupling state IO to the rule-result schema.
 */
export interface Finding {
  id: string;
  ruleId: string;
  severity: string;
  confidence: string;
  message: string;
  url?: string;
  [key: string]: unknown;
}

export interface UrlStateEntry {
  contentHash: string;
  fetchedAt: string;
  status: number;
  /** Kept for back-compat within v2; derived from `findings`. */
  findingIds: string[];
  /** Full finding records persisted so unchanged URLs can carry findings forward. */
  findings: Finding[];
  /** Ruleset signature at the time this URL was last fetched. */
  rulesetVersion: string;
  /** HTTP `Last-Modified` response header captured at fetch. */
  lastModified?: string;
  /** HTTP `ETag` response header captured at fetch. */
  etag?: string;
  /** Sitemap `<lastmod>` value associated with this URL at the audit. */
  sitemapLastmodAtAudit?: string;
  gscMetricsAtLastRun?: { impressions: number; clicks: number; period: string };
}

export interface RunState {
  version: number;
  lastRun: string;
  /** ISO timestamp of the last full (non-delta) audit. */
  lastFullAuditAt: string;
  source: string;
  renderMode: RenderMode;
  /** Ruleset signature at the time this state file was written. */
  rulesetVersion: string;
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
      typeof state.lastFullAuditAt !== "string" ||
      typeof state.source !== "string" ||
      typeof state.renderMode !== "string" ||
      typeof state.rulesetVersion !== "string" ||
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
