import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { triageCacheKey, readTriageCache, writeTriageCache } from "../../src/ai/cache.js";
import type { TriageResult } from "../../src/ai/types.js";

const sample: TriageResult = {
  rootCauses: [{
    label: "x", findingsCount: 1, affectedRuleIds: ["x/y"], severity: "info",
    fixOrder: 1, rationale: "r", relatedFindingIds: [],
  }],
  narrative: "n",
  modelUsed: "m",
  providerId: "anthropic",
  tokenUsage: { input: 10, output: 5 },
  cacheHit: false,
  promptVersion: "1.0.0",
  truncatedInput: false,
};

describe("triageCacheKey", () => {
  it("is deterministic", () => {
    const a = triageCacheKey({ findingsHash: "abc", model: "m", promptVersion: "1.0.0" });
    const b = triageCacheKey({ findingsHash: "abc", model: "m", promptVersion: "1.0.0" });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs by promptVersion", () => {
    const a = triageCacheKey({ findingsHash: "abc", model: "m", promptVersion: "1.0.0" });
    const b = triageCacheKey({ findingsHash: "abc", model: "m", promptVersion: "1.0.1" });
    expect(a).not.toBe(b);
  });

  it("differs by model", () => {
    const a = triageCacheKey({ findingsHash: "abc", model: "m1", promptVersion: "1.0.0" });
    const b = triageCacheKey({ findingsHash: "abc", model: "m2", promptVersion: "1.0.0" });
    expect(a).not.toBe(b);
  });
});

describe("triage cache I/O", () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "pseolint-aicache-")); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it("returns null when entry missing", async () => {
    const r = await readTriageCache(dir, "abc123", 1000);
    expect(r).toBeNull();
  });

  it("writes and reads back", async () => {
    await writeTriageCache(dir, "abc123", sample);
    const r = await readTriageCache(dir, "abc123", 60_000);
    expect(r).not.toBeNull();
    expect(r!.narrative).toBe("n");
  });

  it("returns null when entry stale (TTL exceeded)", async () => {
    await writeTriageCache(dir, "abc123", sample);
    // Sleep barely past 1ms
    await new Promise((r) => setTimeout(r, 5));
    const r = await readTriageCache(dir, "abc123", 1);
    expect(r).toBeNull();
  });

  it("write is atomic (no .tmp file leftover after success)", async () => {
    await writeTriageCache(dir, "abc123", sample);
    const files = await readdir(dir);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("returns null on malformed JSON", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(dir, "abc123.json"), "{not json", "utf8");
    const r = await readTriageCache(dir, "abc123", 60_000);
    expect(r).toBeNull();
  });
});
