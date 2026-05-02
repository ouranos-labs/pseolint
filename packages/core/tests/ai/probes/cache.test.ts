import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  probeCacheKey,
  readProbeCache,
  writeProbeCache,
} from "../../../src/ai/probes/cache.js";

describe("probeCacheKey", () => {
  it("is deterministic across argument orderings within the same call", () => {
    expect(probeCacheKey("a", "b", "c")).toBe(probeCacheKey("a", "b", "c"));
  });

  it("differs when any part differs", () => {
    expect(probeCacheKey("a", "b")).not.toBe(probeCacheKey("a", "c"));
  });

  it("is order-sensitive (a|b ≠ b|a)", () => {
    expect(probeCacheKey("a", "b")).not.toBe(probeCacheKey("b", "a"));
  });
});

describe("probe cache read/write", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-probe-cache-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null on miss", async () => {
    expect(await readProbeCache<{ x: number }>(dir, "abc", 60_000)).toBeNull();
  });

  it("round-trips a JSON-serializable payload", async () => {
    const key = probeCacheKey("test");
    await writeProbeCache(dir, key, { hello: "world", n: 42 });
    const read = await readProbeCache<{ hello: string; n: number }>(dir, key, 60_000);
    expect(read).toEqual({ hello: "world", n: 42 });
  });

  it("returns null when entry is older than ttlMs", async () => {
    const key = probeCacheKey("expired");
    await writeProbeCache(dir, key, { stale: true });
    // TTL = 0 → any entry is immediately expired.
    expect(await readProbeCache(dir, key, 0)).toBeNull();
  });

  it("returns null on malformed JSON file", async () => {
    const key = probeCacheKey("malformed");
    await writeFile(join(dir, `${key}.json`), "not json", "utf8");
    expect(await readProbeCache(dir, key, 60_000)).toBeNull();
  });

  it("returns null when cachedAt is missing", async () => {
    const key = probeCacheKey("nodate");
    await writeFile(join(dir, `${key}.json`), JSON.stringify({ data: { ok: true } }), "utf8");
    expect(await readProbeCache(dir, key, 60_000)).toBeNull();
  });
});
