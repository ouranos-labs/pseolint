import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cacheKeyFor,
  clearCache,
  getCacheSizeInfo,
  pruneCache,
  readCacheEntry,
  writeCacheEntry,
  isRedirectPointer,
  CACHE_ENTRY_SCHEMA_VERSION,
  isCacheEntryFresh,
  shouldNegativeCache,
  NEGATIVE_CACHE_TTL_MS,
  cachedFetch,
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

describe("cache freshness and negative caching", () => {
  it("isCacheEntryFresh returns true when within TTL", () => {
    const now = Date.parse("2026-04-17T12:00:00Z");
    const fetchedAt = new Date(now - 1000).toISOString();
    expect(isCacheEntryFresh(fetchedAt, 60_000, now)).toBe(true);
  });

  it("isCacheEntryFresh returns false when past TTL", () => {
    const now = Date.parse("2026-04-17T12:00:00Z");
    const fetchedAt = new Date(now - 120_000).toISOString();
    expect(isCacheEntryFresh(fetchedAt, 60_000, now)).toBe(false);
  });

  it("shouldNegativeCache accepts 4xx", () => {
    expect(shouldNegativeCache(404)).toBe(true);
    expect(shouldNegativeCache(410)).toBe(true);
  });

  it("shouldNegativeCache rejects 5xx and 2xx", () => {
    expect(shouldNegativeCache(500)).toBe(false);
    expect(shouldNegativeCache(503)).toBe(false);
    expect(shouldNegativeCache(200)).toBe(false);
  });

  it("NEGATIVE_CACHE_TTL_MS is 24 hours", () => {
    expect(NEGATIVE_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});

// Null-body statuses per Fetch spec (https://fetch.spec.whatwg.org/#null-body-status)
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function mockFetcher(responses: Array<{ status: number; headers: Record<string, string>; body: string }>) {
  let call = 0;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn = async (url: string, init?: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    const r = responses[call];
    if (!r) throw new Error(`mockFetcher: no response for call ${call}`);
    call += 1;
    const body = NULL_BODY_STATUSES.has(r.status) ? null : r.body;
    return new Response(body, { status: r.status, headers: r.headers });
  };
  return { fn, calls };
}

describe("cachedFetch", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-cached-fetch-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("cache miss: fetches and stores entry", async () => {
    const mock = mockFetcher([
      { status: 200, headers: { etag: '"v1"', "content-type": "text/html" }, body: "<html>hi</html>" },
    ]);
    const result = await cachedFetch("https://example.com/a", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock.fn,
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe("<html>hi</html>");
    expect(result.fromCache).toBe(false);
    expect(mock.calls).toHaveLength(1);
  });

  it("cache hit (TTL fresh, no validators): returns cached without HTTP", async () => {
    const mock1 = mockFetcher([
      { status: 200, headers: { "content-type": "text/html" }, body: "cached body" },
    ]);
    await cachedFetch("https://example.com/b", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock1.fn,
    });
    const mock2 = mockFetcher([]);
    const result = await cachedFetch("https://example.com/b", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock2.fn,
    });
    expect(result.body).toBe("cached body");
    expect(result.fromCache).toBe(true);
    expect(mock2.calls).toHaveLength(0);
  });

  it("cache hit with ETag: sends conditional request; 304 returns cached", async () => {
    const mock1 = mockFetcher([
      { status: 200, headers: { etag: '"v1"' }, body: "original" },
    ]);
    await cachedFetch("https://example.com/c", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 0 },
      fetcher: mock1.fn,
    });
    const mock2 = mockFetcher([
      { status: 304, headers: {}, body: "" },
    ]);
    const result = await cachedFetch("https://example.com/c", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 0 },
      fetcher: mock2.fn,
    });
    expect(result.body).toBe("original");
    expect(result.fromCache).toBe(true);
    expect(mock2.calls[0].init?.headers).toEqual(
      expect.objectContaining({ "if-none-match": '"v1"' })
    );
  });

  it("conditional 200 overwrites cached body", async () => {
    const mock1 = mockFetcher([
      { status: 200, headers: { etag: '"v1"' }, body: "old" },
    ]);
    await cachedFetch("https://example.com/d", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 0 },
      fetcher: mock1.fn,
    });
    const mock2 = mockFetcher([
      { status: 200, headers: { etag: '"v2"' }, body: "new" },
    ]);
    const result = await cachedFetch("https://example.com/d", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 0 },
      fetcher: mock2.fn,
    });
    expect(result.body).toBe("new");
    expect(result.fromCache).toBe(false);
  });

  it("cache disabled (null): bypasses cache entirely", async () => {
    const mock = mockFetcher([
      { status: 200, headers: {}, body: "direct" },
      { status: 200, headers: {}, body: "direct again" },
    ]);
    const r1 = await cachedFetch("https://example.com/e", { timeoutMs: 5000, cache: null, fetcher: mock.fn });
    const r2 = await cachedFetch("https://example.com/e", { timeoutMs: 5000, cache: null, fetcher: mock.fn });
    expect(r1.body).toBe("direct");
    expect(r2.body).toBe("direct again");
    expect(r1.fromCache).toBe(false);
    expect(r2.fromCache).toBe(false);
    expect(mock.calls).toHaveLength(2);
  });

  it("4xx stored with negative-cache TTL", async () => {
    const mock1 = mockFetcher([{ status: 404, headers: {}, body: "not found" }]);
    const r1 = await cachedFetch("https://example.com/missing", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock1.fn,
    });
    expect(r1.status).toBe(404);
    const mock2 = mockFetcher([]);
    const r2 = await cachedFetch("https://example.com/missing", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock2.fn,
    });
    expect(r2.status).toBe(404);
    expect(r2.fromCache).toBe(true);
    expect(mock2.calls).toHaveLength(0);
  });

  it("5xx NOT cached", async () => {
    const mock1 = mockFetcher([{ status: 503, headers: {}, body: "down" }]);
    await cachedFetch("https://example.com/sick", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock1.fn,
    });
    const mock2 = mockFetcher([{ status: 200, headers: {}, body: "ok now" }]);
    const r2 = await cachedFetch("https://example.com/sick", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock2.fn,
    });
    expect(r2.status).toBe(200);
    expect(mock2.calls).toHaveLength(1);
  });

});

describe("cachedFetch redirects", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-redirect-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("follows redirect and stores pointer + content entries", async () => {
    const mock = mockFetcher([
      { status: 301, headers: { location: "https://example.com/final" }, body: "" },
      { status: 200, headers: {}, body: "final content" },
    ]);
    const r = await cachedFetch("https://example.com/old", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock.fn,
    });
    expect(r.url).toBe("https://example.com/final");
    expect(r.body).toBe("final content");
    expect(mock.calls).toHaveLength(2);
  });

  it("subsequent request to origin URL resolves through pointer without HTTP", async () => {
    const setup = mockFetcher([
      { status: 301, headers: { location: "https://example.com/final" }, body: "" },
      { status: 200, headers: {}, body: "final" },
    ]);
    await cachedFetch("https://example.com/old", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: setup.fn,
    });
    const second = mockFetcher([]);
    const r = await cachedFetch("https://example.com/old", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: second.fn,
    });
    expect(r.url).toBe("https://example.com/final");
    expect(r.body).toBe("final");
    expect(r.fromCache).toBe(true);
    expect(second.calls).toHaveLength(0);
  });

  it("stale pointer triggers re-fetch of origin URL", async () => {
    // Seed a stale pointer + fresh target
    const staleFetchedAt = new Date(Date.now() - 120_000).toISOString();
    const key = cacheKeyFor("https://example.com/stale-origin");
    await writeFile(
      join(dir, key),
      JSON.stringify({
        schemaVersion: 1,
        redirectsTo: "https://example.com/target",
        fetchedAt: staleFetchedAt,
        status: 301,
      }),
      "utf8"
    );
    const mock = mockFetcher([
      { status: 301, headers: { location: "https://example.com/target" }, body: "" },
      { status: 200, headers: {}, body: "fresh target" },
    ]);
    const r = await cachedFetch("https://example.com/stale-origin", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 }, // 60s TTL; pointer is 120s old
      fetcher: mock.fn,
    });
    expect(r.body).toBe("fresh target");
    expect(r.fromCache).toBe(false);
    expect(mock.calls).toHaveLength(2);
  });

  it("relative Location header resolves correctly", async () => {
    const mock = mockFetcher([
      { status: 302, headers: { location: "/relative-target" }, body: "" },
      { status: 200, headers: {}, body: "relative OK" },
    ]);
    const r = await cachedFetch("https://example.com/source", {
      timeoutMs: 5000,
      cache: { dir, ttlMs: 60_000 },
      fetcher: mock.fn,
    });
    expect(r.url).toBe("https://example.com/relative-target");
    expect(r.body).toBe("relative OK");
  });

  it("throws on redirect loop", async () => {
    const mock = mockFetcher([
      { status: 301, headers: { location: "https://example.com/b" }, body: "" },
      { status: 301, headers: { location: "https://example.com/a" }, body: "" },
    ]);
    await expect(
      cachedFetch("https://example.com/a", {
        timeoutMs: 5000,
        cache: { dir, ttlMs: 60_000 },
        fetcher: mock.fn,
      })
    ).rejects.toThrow(/redirect loop/);
  });

  it("throws on >10 hops", async () => {
    const responses = Array.from({ length: 12 }, (_, i) => ({
      status: 301 as const,
      headers: { location: `https://example.com/hop${i + 1}` },
      body: "",
    }));
    const mock = mockFetcher(responses);
    await expect(
      cachedFetch("https://example.com/hop0", {
        timeoutMs: 5000,
        cache: { dir, ttlMs: 60_000 },
        fetcher: mock.fn,
      })
    ).rejects.toThrow(/too many redirects/);
  });

  it("throws on malformed Location header", async () => {
    const mock = mockFetcher([
      { status: 301, headers: { location: "http://" }, body: "" },
    ]);
    await expect(
      cachedFetch("https://example.com/bad", {
        timeoutMs: 5000,
        cache: { dir, ttlMs: 60_000 },
        fetcher: mock.fn,
      })
    ).rejects.toThrow(/invalid Location header/);
  });
});

describe("getCacheSizeInfo", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-cache-size-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns zero for missing directory", async () => {
    const info = await getCacheSizeInfo(join(dir, "nonexistent"));
    expect(info).toEqual({ bytes: 0, fileCount: 0 });
  });

  it("returns zero for empty directory", async () => {
    expect(await getCacheSizeInfo(dir)).toEqual({ bytes: 0, fileCount: 0 });
  });

  it("sums bytes across valid entries, ignores .tmp and unrelated files", async () => {
    await writeCacheEntry(dir, "https://example.com/a", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, url: "https://example.com/a",
      fetchedAt: "2026-04-17T12:00:00Z", status: 200, headers: {}, body: "x".repeat(500),
    });
    await writeCacheEntry(dir, "https://example.com/b", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, url: "https://example.com/b",
      fetchedAt: "2026-04-17T12:00:00Z", status: 200, headers: {}, body: "y".repeat(1000),
    });
    // Noise that must be ignored
    await writeFile(join(dir, "abc.tmp"), "partial garbage", "utf8");
    await writeFile(join(dir, "README"), "hello", "utf8");
    const info = await getCacheSizeInfo(dir);
    expect(info.fileCount).toBe(2);
    expect(info.bytes).toBeGreaterThan(1400);
  });
});

describe("pruneCache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-cache-prune-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("is a no-op when under the cap", async () => {
    await writeCacheEntry(dir, "https://example.com/a", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, url: "https://example.com/a",
      fetchedAt: "2026-04-17T12:00:00Z", status: 200, headers: {}, body: "hello",
    });
    const result = await pruneCache(dir, 1_000_000);
    expect(result.removedEntries).toBe(0);
    expect(result.after.fileCount).toBe(1);
  });

  it("evicts oldest-mtime entries first until under the cap", async () => {
    // Each body is ~100 bytes; 3 entries total. Cap at ~250 bytes -> evict oldest.
    const urls = ["https://example.com/old", "https://example.com/mid", "https://example.com/new"];
    for (const u of urls) {
      await writeCacheEntry(dir, u, {
        schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, url: u,
        fetchedAt: "2026-04-17T12:00:00Z", status: 200, headers: {}, body: "z".repeat(200),
      });
    }
    // Force a known mtime ordering: old < mid < new
    const now = Date.now() / 1000;
    await utimes(join(dir, cacheKeyFor(urls[0])), now - 300, now - 300);
    await utimes(join(dir, cacheKeyFor(urls[1])), now - 200, now - 200);
    await utimes(join(dir, cacheKeyFor(urls[2])), now - 100, now - 100);

    const before = await getCacheSizeInfo(dir);
    expect(before.fileCount).toBe(3);

    const target = Math.floor(before.bytes * 0.5); // keep only newest ~half
    const result = await pruneCache(dir, target);

    expect(result.removedEntries).toBeGreaterThan(0);
    expect(result.after.bytes).toBeLessThanOrEqual(before.bytes);

    // The "old" entry must have been evicted first
    const remaining = await readdir(dir);
    expect(remaining).not.toContain(cacheKeyFor(urls[0]));
    expect(remaining).toContain(cacheKeyFor(urls[2]));
  });

  it("sweeps leftover .tmp files even when under size cap", async () => {
    await writeFile(join(dir, "aaa.tmp"), "partial", "utf8");
    await writeFile(join(dir, "bbb.tmp"), "partial", "utf8");
    const result = await pruneCache(dir, 1_000_000);
    expect(result.removedTmpFiles).toBe(2);
    const names = await readdir(dir);
    expect(names.filter((n) => n.endsWith(".tmp"))).toHaveLength(0);
  });

  it("is a no-op on missing directory", async () => {
    const result = await pruneCache(join(dir, "nonexistent"), 1000);
    expect(result).toEqual({
      before: { bytes: 0, fileCount: 0 },
      after: { bytes: 0, fileCount: 0 },
      removedEntries: 0,
      removedTmpFiles: 0,
    });
  });

  it("treats maxBytes <= 0 as unlimited (tmp sweep still runs)", async () => {
    await writeCacheEntry(dir, "https://example.com/a", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, url: "https://example.com/a",
      fetchedAt: "2026-04-17T12:00:00Z", status: 200, headers: {}, body: "x".repeat(100_000),
    });
    await writeFile(join(dir, "stale.tmp"), "junk", "utf8");
    const result = await pruneCache(dir, 0);
    expect(result.removedEntries).toBe(0);
    expect(result.removedTmpFiles).toBe(1);
    expect(result.after.fileCount).toBe(1);
  });
});

describe("clearCache", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "pseolint-cache-clear-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("removes all cache entries and .tmp files, preserves unrelated files", async () => {
    await writeCacheEntry(dir, "https://example.com/a", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, url: "https://example.com/a",
      fetchedAt: "2026-04-17T12:00:00Z", status: 200, headers: {}, body: "hello",
    });
    await writeCacheEntry(dir, "https://example.com/b", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION, url: "https://example.com/b",
      fetchedAt: "2026-04-17T12:00:00Z", status: 200, headers: {}, body: "world",
    });
    await writeFile(join(dir, "orphan.tmp"), "garbage", "utf8");
    await writeFile(join(dir, "README"), "keep me", "utf8");

    const result = await clearCache(dir);
    expect(result.removed).toBe(2);
    const remaining = await readdir(dir);
    expect(remaining).toEqual(["README"]);
  });

  it("is a no-op on missing directory", async () => {
    const result = await clearCache(join(dir, "nonexistent"));
    expect(result.removed).toBe(0);
  });
});
