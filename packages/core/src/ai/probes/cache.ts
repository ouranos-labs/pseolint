import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface StoredEntry<T> {
  cachedAt: string;
  data: T;
}

export function probeCacheKey(...parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/**
 * Lightweight content-addressable cache for external probe responses
 * (SerpAPI, ask_ai_engine). Simpler than the cachedFetch HTTP cache —
 * no ETag/Last-Modified, no negative cache, just key → JSON with TTL.
 *
 * Misses (file absent, malformed, expired) all return null silently —
 * the caller fetches fresh and writes back.
 */
export async function readProbeCache<T>(dir: string, key: string, ttlMs: number): Promise<T | null> {
  const path = join(dir, `${key}.json`);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  let entry: StoredEntry<T>;
  try {
    entry = JSON.parse(raw) as StoredEntry<T>;
  } catch {
    return null;
  }
  if (typeof entry.cachedAt !== "string") return null;
  const ageMs = Date.now() - new Date(entry.cachedAt).getTime();
  // >= so ttlMs=0 means "always expired" even when the write and the read land
  // in the same millisecond (ageMs 0 > ttlMs 0 was false — a same-ms race).
  if (Number.isNaN(ageMs) || ageMs >= ttlMs) return null;
  return entry.data;
}

export async function writeProbeCache<T>(dir: string, key: string, data: T): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${key}.json`);
  const tmp = `${path}.tmp`;
  const entry: StoredEntry<T> = { cachedAt: new Date().toISOString(), data };
  await writeFile(tmp, JSON.stringify(entry), "utf8");
  await rename(tmp, path);
}
