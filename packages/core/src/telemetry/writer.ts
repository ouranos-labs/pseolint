import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { telemetryRecordSchema, type TelemetryRecord } from "./types.js";

/**
 * Append a single telemetry record as one JSON line.
 *
 * Telemetry MUST NEVER throw to the caller: an audit must not fail because a
 * log line could not be written. We swallow both I/O errors (expected, e.g.
 * read-only filesystem, path clash) and schema errors (a programmer bug where
 * an internal caller passed the wrong shape). Schema bugs log a single warning
 * to stderr so they remain discoverable.
 */
export async function appendTelemetryRecord(
  path: string,
  record: TelemetryRecord
): Promise<void> {
  let serialized: string;
  try {
    const parsed = telemetryRecordSchema.parse(record);
    serialized = JSON.stringify(parsed) + "\n";
  } catch (err) {
    // Programmer bug: invalid record shape. Warn once and bail, don't throw.
    try {
      // eslint-disable-next-line no-console
      console.warn(
        "[telemetry] refusing to write invalid record:",
        err instanceof Error ? err.message : String(err)
      );
    } catch {
      // stderr itself failed; nothing we can do.
    }
    return;
  }

  try {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, serialized, "utf8");
  } catch {
    // Silent failure: telemetry MUST NOT block an audit.
  }
}
