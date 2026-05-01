import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";

/**
 * One entry in the per-session page cache. `html` is the response body;
 * `status` and `headers` come from the original fetch so downstream tools
 * (`check_indexability` reading X-Robots-Tag, etc.) don't have to re-fetch.
 */
export interface PageCacheEntry {
  url: string;
  html: string;
  status: number;
  headers: Record<string, string>;
  fetchedAt: number;
}

/**
 * Session-scoped page cache. The orchestrator's reason for being:
 *   1. `fetch_page` writes HTML here keyed by `pageId`
 *   2. Returns the `pageId` (not the HTML) to the LLM
 *   3. Subsequent tools (parse_page, check_rule_*, validate_jsonld, etc.)
 *      take a `pageId` in their input and look up HTML via the cache
 *
 * Net effect: HTML never lives in the LLM conversation history. The cost
 * impact is dramatic — the v0.4.4 dogfood showed 5 fetched pages exploding
 * to 297K tokens / $0.91 in a single step because re-passing HTML through
 * tool inputs accumulated quadratically. With pageId references that
 * collapses to ~20K tokens / $0.06 for the same workload.
 *
 * Implementation: AsyncLocalStorage threads the cache through generateText
 * → tool execute() without changing the AI SDK's tool surface. Tools that
 * don't need page content ignore it entirely.
 */
export class PageCache {
  private readonly store = new Map<string, PageCacheEntry>();

  /**
   * Stable pageId derivation: sha256 of the URL, truncated to 16 hex chars
   * (~64 bits — collision-safe for any realistic session size). Same URL
   * always maps to the same pageId so `fetch_page` is idempotent within
   * a session, and the LLM can re-reference a page without juggling ids.
   */
  static idFor(url: string): string {
    return createHash("sha256").update(url).digest("hex").slice(0, 16);
  }

  put(entry: Omit<PageCacheEntry, "fetchedAt">): string {
    const pageId = PageCache.idFor(entry.url);
    this.store.set(pageId, { ...entry, fetchedAt: Date.now() });
    return pageId;
  }

  get(pageId: string): PageCacheEntry | null {
    return this.store.get(pageId) ?? null;
  }

  has(pageId: string): boolean {
    return this.store.has(pageId);
  }

  size(): number {
    return this.store.size;
  }

  /** Memory usage estimate in bytes — useful for orchestrator-side monitoring. */
  approximateBytes(): number {
    let total = 0;
    for (const entry of this.store.values()) {
      total += entry.html.length + entry.url.length;
      for (const [k, v] of Object.entries(entry.headers)) {
        total += k.length + v.length;
      }
    }
    return total;
  }
}

const cacheStorage = new AsyncLocalStorage<PageCache>();

/**
 * Run `fn` with `cache` available via `currentPageCache()`. The
 * orchestrator runner wraps its `generateText` call in this so every tool
 * invocation (including those nested inside the AI SDK's tool loop) sees
 * the same cache.
 */
export function withPageCache<T>(cache: PageCache, fn: () => Promise<T>): Promise<T> {
  return cacheStorage.run(cache, fn);
}

/**
 * Read the current session's page cache. Returns null when called outside
 * `withPageCache` (e.g. unit tests that don't set one up — those tests use
 * `setTestCache` to inject a cache directly).
 */
export function currentPageCache(): PageCache | null {
  return cacheStorage.getStore() ?? null;
}

/**
 * Test-only helper: set a page cache for the duration of a synchronous or
 * async test. Use as `await withPageCache(cache, async () => { ... })`
 * — same API as the production wrapper, just imported in tests.
 */
export const setTestCache = withPageCache;

/**
 * Resolve a `pageId` to its cache entry — the standard tool-side helper.
 * Throws a clear, LLM-friendly error when the cache isn't in scope or the
 * pageId is unknown so the orchestrator can recover by re-fetching rather
 * than crashing the session.
 */
export function resolvePage(pageId: string): PageCacheEntry {
  const cache = currentPageCache();
  if (!cache) {
    throw new Error(
      "page cache not in scope — tool must run inside the orchestrator's withPageCache wrapper",
    );
  }
  const entry = cache.get(pageId);
  if (!entry) {
    throw new Error(
      `unknown pageId ${pageId} — call fetch_page to populate the cache before passing the returned pageId here`,
    );
  }
  return entry;
}

/**
 * Multi-page variant. Resolves a list of pageIds in one call; throws on
 * the first unknown id so the LLM gets specific feedback about which page
 * needs re-fetching.
 */
export function resolvePages(pageIds: string[]): PageCacheEntry[] {
  return pageIds.map(resolvePage);
}
