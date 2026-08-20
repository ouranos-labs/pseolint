import { describe, it, expect } from "vitest";
import { cachedFetch, CACHE_ENTRY_SCHEMA_VERSION, type CacheBackend, type AnyCacheEntry } from "../src/cache.js";

/** In-memory CacheBackend: proves cachedFetch's revalidation logic is backend-agnostic. */
class MemoryBackend implements CacheBackend {
  store = new Map<string, AnyCacheEntry>();
  async get(url: string): Promise<AnyCacheEntry | null> {
    return this.store.get(url) ?? null;
  }
  async set(url: string, entry: AnyCacheEntry): Promise<void> {
    this.store.set(url, entry);
  }
}

function htmlResponse(body: string, headers: Record<string, string> = {}, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html", ...headers } });
}

describe("CacheBackend (backend-agnostic cachedFetch)", () => {
  it("round-trips through a custom backend: set on miss, hit on re-fetch", async () => {
    const backend = new MemoryBackend();
    let calls = 0;
    const fetcher = async () => { calls += 1; return htmlResponse("<h1>hello</h1>"); };

    const first = await cachedFetch("https://example.com/x", { timeoutMs: 5000, cache: { backend, ttlMs: 60_000 }, fetcher });
    expect(first.fromCache).toBe(false);
    expect(calls).toBe(1);
    expect(backend.store.has("https://example.com/x")).toBe(true);

    const second = await cachedFetch("https://example.com/x", { timeoutMs: 5000, cache: { backend, ttlMs: 60_000 }, fetcher });
    expect(second.fromCache).toBe(true);
    expect(second.body).toBe("<h1>hello</h1>");
    expect(calls).toBe(1); // served from the backend: no second origin fetch
  });

  it("revalidates via the backend: a stored ETag triggers a conditional request, 304 → cache hit", async () => {
    const backend = new MemoryBackend();
    backend.store.set("https://example.com/y", {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
      url: "https://example.com/y",
      fetchedAt: new Date().toISOString(),
      status: 200,
      headers: { etag: '"v1"', "content-type": "text/html" },
      body: "<h1>cached</h1>",
    });
    let sawConditional = false;
    const fetcher = async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (headers.get("if-none-match") === '"v1"') { sawConditional = true; return new Response(null, { status: 304 }); }
      return htmlResponse("<h1>fresh</h1>");
    };
    // ttlMs 0 forces revalidation rather than serving the (technically stale) entry directly.
    const result = await cachedFetch("https://example.com/y", { timeoutMs: 5000, cache: { backend, ttlMs: 0 }, fetcher });
    expect(sawConditional).toBe(true);
    expect(result.fromCache).toBe(true);
    expect(result.body).toBe("<h1>cached</h1>");
  });

  it("is fail-safe: a throwing backend degrades to a clean cold fetch, never aborts", async () => {
    const backend: CacheBackend = {
      async get() { throw new Error("backend down"); },
      async set() { throw new Error("backend down"); },
    };
    let calls = 0;
    const fetcher = async () => { calls += 1; return htmlResponse("<h1>cold</h1>"); };
    const result = await cachedFetch("https://example.com/z", { timeoutMs: 5000, cache: { backend, ttlMs: 60_000 }, fetcher });
    expect(result.fromCache).toBe(false);
    expect(result.body).toBe("<h1>cold</h1>");
    expect(calls).toBe(1);
  });
});
