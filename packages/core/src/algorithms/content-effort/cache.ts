import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Key = sha256 of normalized text + model id (model affects the score). */
export function effortCacheKey(contentText: string, modelId: string): string {
  const norm = contentText.replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${modelId} ${norm}`).digest("hex");
}

export async function readEffortCache(dir: string, key: string): Promise<number | null> {
  try {
    const raw = await readFile(join(dir, `${key}.json`), "utf-8");
    const v = (JSON.parse(raw) as { effort: number }).effort;
    return Number.isFinite(v) ? v : null;
  } catch {
    return null; // miss / unreadable — non-fatal
  }
}

export async function writeEffortCache(dir: string, key: string, effort: number): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${key}.json`), JSON.stringify({ effort }) + "\n", "utf-8");
}
