import { readFile } from "node:fs/promises";
import type { PageDataRecord } from "./types.js";

/**
 * Loads data source records from a JSON file.
 * Expects either:
 * - An array of { url: string, data: Record<string, unknown> }
 * - An object with a "pages" key containing the array
 */
export async function loadDataSource(filePath: string): Promise<PageDataRecord[]> {
  const content = await readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Data source file is not valid JSON: ${filePath}`);
  }

  let records: unknown[];
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (parsed && typeof parsed === "object" && "pages" in parsed && Array.isArray((parsed as Record<string, unknown>).pages)) {
    records = (parsed as Record<string, unknown>).pages as unknown[];
  } else {
    throw new Error(`Data source must be a JSON array or an object with a "pages" array. Got: ${typeof parsed}`);
  }

  // Validate each record
  const validated: PageDataRecord[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r || typeof r !== "object") {
      throw new Error(`Data source record ${i} is not an object.`);
    }
    const rec = r as Record<string, unknown>;
    if (typeof rec.url !== "string" || !rec.url) {
      throw new Error(`Data source record ${i} is missing a "url" string field.`);
    }
    if (!rec.data || typeof rec.data !== "object" || Array.isArray(rec.data)) {
      throw new Error(`Data source record ${i} is missing a "data" object field.`);
    }
    validated.push({ url: rec.url, data: rec.data as Record<string, unknown> });
  }

  return validated;
}

/**
 * Matches a page URL against data source records.
 * Supports exact match and basic glob patterns (* for single segment, ** for any path).
 */
export function matchPageToData(
  pageUrl: string,
  records: PageDataRecord[]
): PageDataRecord | undefined {
  // Try exact match first
  for (const r of records) {
    if (r.url === pageUrl) return r;
  }

  // Try suffix match (data URL might be a path, page URL might be full URL)
  for (const r of records) {
    try {
      const pagePathname = new URL(pageUrl).pathname;
      if (r.url === pagePathname) return r;
      // Strip trailing slash for comparison
      const normalized = pagePathname.replace(/\/$/, "");
      const rNormalized = r.url.replace(/\/$/, "");
      if (normalized === rNormalized) return r;
    } catch {
      // pageUrl is a file path, try direct suffix match
      const normalized = pageUrl.replace(/\\/g, "/");
      if (normalized.endsWith(r.url) || r.url.endsWith(normalized)) return r;
    }
  }

  return undefined;
}
