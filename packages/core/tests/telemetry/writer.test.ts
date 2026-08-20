import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendTelemetryRecord } from "../../src/telemetry/writer.js";
import {
  telemetryRecordSchema,
  type AuditRecord,
  type FeedbackRecord,
} from "../../src/telemetry/types.js";

const auditA: AuditRecord = {
  type: "audit",
  schemaVersion: 1,
  runId: "0123456789abcdef",
  timestamp: "2026-04-18T12:00:00.000Z",
  durationMs: 1000,
  score: 80,
  pageCount: 5,
  findingCount: 2,
};

const auditB: AuditRecord = {
  ...auditA,
  runId: "fedcba9876543210",
  timestamp: "2026-04-18T13:00:00.000Z",
  score: 90,
};

const feedback: FeedbackRecord = {
  type: "feedback",
  schemaVersion: 1,
  runId: "0123456789abcdef",
  timestamp: "2026-04-18T12:05:00.000Z",
  rating: "helpful",
};

describe("appendTelemetryRecord", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-telemetry-writer-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("creates the parent directory if missing and appends a valid record", async () => {
    const path = join(dir, "deep", "nested", "telemetry.jsonl");
    await appendTelemetryRecord(path, auditA);
    const contents = await readFile(path, "utf8");
    expect(contents.endsWith("\n")).toBe(true);
    const round = telemetryRecordSchema.parse(
      JSON.parse(contents.trim())
    );
    expect(round).toEqual(auditA);
  });

  it("multiple appends produce multiple lines in order", async () => {
    const path = join(dir, "telemetry.jsonl");
    await appendTelemetryRecord(path, auditA);
    await appendTelemetryRecord(path, feedback);
    await appendTelemetryRecord(path, auditB);
    const contents = await readFile(path, "utf8");
    const lines = contents.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(3);
    const parsed = lines.map((l) =>
      telemetryRecordSchema.parse(JSON.parse(l))
    );
    expect(parsed[0]).toEqual(auditA);
    expect(parsed[1]).toEqual(feedback);
    expect(parsed[2]).toEqual(auditB);
  });

  it("does not throw when the target path is impossible (file-where-dir-expected)", async () => {
    // Create a regular file, then try to write a telemetry record at a
    // path that treats that file as a directory. The mkdir call will fail
    // with ENOTDIR (or EEXIST on some platforms); the writer must swallow it.
    const clash = join(dir, "not-a-dir");
    await writeFile(clash, "i am a file, not a directory", "utf8");
    const impossible = join(clash, "telemetry.jsonl");
    await expect(
      appendTelemetryRecord(impossible, auditA)
    ).resolves.toBeUndefined();
  });

  it("does not throw when given a schema-violating record (swallows programmer bug)", async () => {
    const path = join(dir, "telemetry.jsonl");
    // Cast to bypass the TS check; we are asserting the runtime
    // behavior of an invalid record shape.
    const bad = { ...auditA, extraField: "nope" } as unknown as AuditRecord;
    await expect(
      appendTelemetryRecord(path, bad)
    ).resolves.toBeUndefined();
    // File should not exist / be empty because write was refused.
    let exists = true;
    try {
      const contents = await readFile(path, "utf8");
      // If the file got created it must be empty: strict acceptance.
      expect(contents).toBe("");
    } catch {
      exists = false;
    }
    expect(exists || true).toBe(true);
  });
});
