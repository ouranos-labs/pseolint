import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTelemetryJsonl } from "../../src/telemetry/reader.js";
import type {
  AuditRecord,
  FeedbackRecord,
} from "../../src/telemetry/types.js";

const audit: AuditRecord = {
  type: "audit",
  schemaVersion: 1,
  runId: "0123456789abcdef",
  timestamp: "2026-04-18T12:00:00.000Z",
  durationMs: 1000,
  score: 80,
  pageCount: 5,
  findingCount: 2,
};

const feedback: FeedbackRecord = {
  type: "feedback",
  schemaVersion: 1,
  runId: "0123456789abcdef",
  timestamp: "2026-04-18T12:05:00.000Z",
  rating: "helpful",
};

describe("readTelemetryJsonl", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-telemetry-reader-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns an empty array when the file is missing", async () => {
    const out = await readTelemetryJsonl(join(dir, "nope.jsonl"));
    expect(out).toEqual([]);
  });

  it("returns an empty array for an empty file", async () => {
    const path = join(dir, "empty.jsonl");
    await writeFile(path, "", "utf8");
    const out = await readTelemetryJsonl(path);
    expect(out).toEqual([]);
  });

  it("parses a file with multiple valid JSONL records", async () => {
    const path = join(dir, "ok.jsonl");
    const contents =
      JSON.stringify(audit) + "\n" + JSON.stringify(feedback) + "\n";
    await writeFile(path, contents, "utf8");
    const out = await readTelemetryJsonl(path);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(audit);
    expect(out[1]).toEqual(feedback);
  });

  it("silently skips malformed JSON lines but keeps valid ones", async () => {
    const path = join(dir, "mixed.jsonl");
    const contents = [
      JSON.stringify(audit),
      "{this is not valid json",
      JSON.stringify(feedback),
      "",
    ].join("\n");
    await writeFile(path, contents, "utf8");
    const out = await readTelemetryJsonl(path);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(audit);
    expect(out[1]).toEqual(feedback);
  });

  it("silently skips schema-violating lines (e.g. extra fields in strict mode)", async () => {
    const path = join(dir, "strict.jsonl");
    const bad = { ...audit, someExtraThing: "boom" };
    const futureVersion = { ...audit, schemaVersion: 2 };
    const contents = [
      JSON.stringify(audit),
      JSON.stringify(bad),
      JSON.stringify(futureVersion),
      JSON.stringify(feedback),
    ].join("\n");
    await writeFile(path, contents, "utf8");
    const out = await readTelemetryJsonl(path);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual(audit);
    expect(out[1]).toEqual(feedback);
  });

  it("tolerates blank lines interleaved with records", async () => {
    const path = join(dir, "blanks.jsonl");
    const contents =
      "\n" + JSON.stringify(audit) + "\n\n" + JSON.stringify(feedback) + "\n\n";
    await writeFile(path, contents, "utf8");
    const out = await readTelemetryJsonl(path);
    expect(out).toHaveLength(2);
  });
});
