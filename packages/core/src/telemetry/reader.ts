import { readFile } from "node:fs/promises";
import { telemetryRecordSchema, type TelemetryRecord } from "./types.js";

/**
 * Read a telemetry JSONL file and return all records that parse successfully
 * against the current schema.
 *
 * - Missing file -> empty array.
 * - Malformed JSON lines -> skipped silently.
 * - Schema-violating lines (e.g. from a future schema version or corruption)
 *   -> skipped silently. This keeps the reader forward-compatible.
 */
export async function readTelemetryJsonl(
  path: string
): Promise<TelemetryRecord[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return [];
  }

  const records: TelemetryRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const json = JSON.parse(trimmed);
      records.push(telemetryRecordSchema.parse(json));
    } catch {
      // skip malformed / schema-violating lines
    }
  }
  return records;
}
