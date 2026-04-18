import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TriageResult } from "./types.js";

interface KeyInput {
  findingsHash: string;
  model: string;
  promptVersion: string;
}

interface StoredEntry {
  cachedAt: string;
  result: TriageResult;
}

export function triageCacheKey(input: KeyInput): string {
  return createHash("sha256")
    .update(`${input.findingsHash}|${input.model}|${input.promptVersion}`)
    .digest("hex");
}

export async function readTriageCache(dir: string, key: string, ttlMs: number): Promise<TriageResult | null> {
  const path = join(dir, `${key}.json`);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  let entry: StoredEntry;
  try {
    entry = JSON.parse(raw) as StoredEntry;
  } catch {
    return null;
  }
  if (typeof entry.cachedAt !== "string" || typeof entry.result !== "object") return null;
  const ageMs = Date.now() - new Date(entry.cachedAt).getTime();
  if (Number.isNaN(ageMs) || ageMs > ttlMs) return null;
  return entry.result;
}

export async function writeTriageCache(dir: string, key: string, result: TriageResult): Promise<void> {
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${key}.json`);
  const tmp = `${path}.tmp`;
  const entry: StoredEntry = { cachedAt: new Date().toISOString(), result };
  await writeFile(tmp, JSON.stringify(entry), "utf8");
  await rename(tmp, path);
}
