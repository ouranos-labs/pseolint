import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cacheKeyFor,
  readCacheEntry,
  writeCacheEntry,
  isRedirectPointer,
  CACHE_ENTRY_SCHEMA_VERSION,
} from "../src/cache.js";

describe("cacheKeyFor", () => {
  it("produces a 64-char hex string", () => {
    const key = cacheKeyFor("https://example.com/page");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(cacheKeyFor("https://example.com/page")).toBe(
      cacheKeyFor("https://example.com/page")
    );
  });

  it("differs for different URLs", () => {
    expect(cacheKeyFor("https://example.com/a")).not.toBe(
      cacheKeyFor("https://example.com/b")
    );
  });
});

describe("cache read/write", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-cache-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null on cache miss", async () => {
    expect(await readCacheEntry(dir, "https://example.com/x")).toBeNull();
  });

  it("writes and reads back an entry", async () => {
    await writeCacheEntry(dir, "https://example.com/a", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
      url: "https://example.com/a",
      fetchedAt: "2026-04-17T12:00:00Z",
      status: 200,
      headers: { etag: '"abc"' },
      body: "<html></html>",
    });
    const got = await readCacheEntry(dir, "https://example.com/a");
    expect(got).not.toBeNull();
    expect(got!.status).toBe(200);
    expect((got as any).body).toBe("<html></html>");
  });

  it("ignores .tmp files on read", async () => {
    const key = cacheKeyFor("https://example.com/x");
    await writeFile(join(dir, `${key}.tmp`), "partial garbage", "utf8");
    expect(await readCacheEntry(dir, "https://example.com/x")).toBeNull();
  });

  it("rejects entries with unknown schemaVersion (returns null)", async () => {
    const key = cacheKeyFor("https://example.com/y");
    await writeFile(
      join(dir, key),
      JSON.stringify({ schemaVersion: 999, url: "x", fetchedAt: "x", status: 200, headers: {}, body: "" }),
      "utf8"
    );
    expect(await readCacheEntry(dir, "https://example.com/y")).toBeNull();
  });

  it("returns null on entry with correct schemaVersion but missing required fields", async () => {
    const key = cacheKeyFor("https://example.com/partial");
    await writeFile(
      join(dir, key),
      JSON.stringify({ schemaVersion: CACHE_ENTRY_SCHEMA_VERSION }),
      "utf8"
    );
    expect(await readCacheEntry(dir, "https://example.com/partial")).toBeNull();
  });

  it("returns null on entry with wrong field types (status as string)", async () => {
    const key = cacheKeyFor("https://example.com/wrongtype");
    await writeFile(
      join(dir, key),
      JSON.stringify({
        schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
        url: "x", fetchedAt: "x", status: "200", headers: {}, body: ""
      }),
      "utf8"
    );
    expect(await readCacheEntry(dir, "https://example.com/wrongtype")).toBeNull();
  });

  it("accepts redirect pointer with correct shape", async () => {
    await writeCacheEntry(dir, "https://example.com/old", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
      redirectsTo: "https://example.com/new",
      fetchedAt: "2026-04-17T12:00:00Z",
      status: 301,
    });
    const got = await readCacheEntry(dir, "https://example.com/old");
    expect(got).not.toBeNull();
    expect(isRedirectPointer(got!)).toBe(true);
  });
});
