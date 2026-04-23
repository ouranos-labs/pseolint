import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";

export const CACHE_ENTRY_SCHEMA_VERSION = 1;

export interface CacheEntry {
  schemaVersion: number;
  url: string;
  fetchedAt: string; // ISO 8601
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface RedirectPointerEntry {
  schemaVersion: number;
  redirectsTo: string;
  fetchedAt: string;
  status: number;
}

export type AnyCacheEntry = CacheEntry | RedirectPointerEntry;

export function isRedirectPointer(entry: AnyCacheEntry): entry is RedirectPointerEntry {
  return "redirectsTo" in entry;
}

export function cacheKeyFor(url: string): string {
  return createHash("sha256").update(url).digest("hex");
}

const CACHE_KEY_RE = /^[0-9a-f]{64}$/;

function assertValidKey(key: string): void {
  if (!CACHE_KEY_RE.test(key)) {
    throw new Error(`invariant violation: cache key must be 64-char hex, got: ${key}`);
  }
}

export async function readCacheEntry(
  dir: string,
  url: string
): Promise<AnyCacheEntry | null> {
  const key = cacheKeyFor(url);
  assertValidKey(key);
  const path = join(dir, key);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const entry = parsed as Partial<AnyCacheEntry>;
  if (entry.schemaVersion !== CACHE_ENTRY_SCHEMA_VERSION) return null;
  if (typeof entry.fetchedAt !== "string") return null;
  if (typeof entry.status !== "number") return null;
  if ("redirectsTo" in entry) {
    if (typeof entry.redirectsTo !== "string") return null;
    return entry as RedirectPointerEntry;
  }
  if (typeof (entry as CacheEntry).url !== "string") return null;
  if (typeof (entry as CacheEntry).body !== "string") return null;
  const headers = (entry as CacheEntry).headers;
  if (!headers || typeof headers !== "object") return null;
  return entry as CacheEntry;
}

export async function writeCacheEntry(
  dir: string,
  requestUrl: string,
  entry: AnyCacheEntry
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const key = cacheKeyFor(requestUrl);
  assertValidKey(key);
  const finalPath = join(dir, key);
  const tmpPath = `${finalPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(entry), "utf8");
  await rename(tmpPath, finalPath);
}

export const NEGATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isStoreableStatus(status: number): boolean {
  return (status >= 200 && status < 300) || (status >= 400 && status < 500);
}

export function isCacheEntryFresh(
  fetchedAtIso: string,
  ttlMs: number,
  now: number = Date.now()
): boolean {
  const fetchedAt = Date.parse(fetchedAtIso);
  if (Number.isNaN(fetchedAt)) return false;
  return now - fetchedAt < ttlMs;
}

export function shouldNegativeCache(status: number): boolean {
  return status >= 400 && status < 500;
}

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface CacheConfig {
  dir: string;
  ttlMs: number;
}

export interface CachedFetchOptions {
  timeoutMs: number;
  cache: CacheConfig | null;
  fetcher?: Fetcher;
  method?: "GET";
  /**
   * External abort signal, e.g. from an audit-level AbortController. Combined
   * with the per-request timeout — whichever fires first cancels the fetch.
   */
  signal?: AbortSignal;
  /**
   * Per-hop URL validator. Called before the initial fetch AND before every
   * redirect hop. Throw to refuse the fetch (e.g. SSRF guard rejecting a 302
   * to a private IP). Use cases: DNS-resolved SSRF check, tenant host allow-
   * list, per-request budget enforcement.
   */
  validateHop?: (url: string) => Promise<void>;
  /**
   * When false, 3xx responses are returned as-is (status + Location header)
   * instead of followed. Default: true.
   */
  followRedirects?: boolean;
}

/**
 * Combine a user-supplied signal with a timeout signal without requiring
 * `AbortSignal.any()` (Node 20.3+). Fires as soon as either input aborts.
 *
 * Returns a tuple of `[signal, dispose]`. The caller MUST invoke `dispose()`
 * after the awaited operation settles (success, error, or timeout) so that
 * the listener registered on `external` is removed and the timer is cleared.
 * Without the dispose call, long-lived external signals accumulate listeners
 * across many fetches and trigger `MaxListenersExceededWarning`.
 *
 * Typical usage:
 *   const [signal, dispose] = combineWithTimeout(timeoutMs, external);
 *   try {
 *     return await fetcher(url, { signal, ... });
 *   } finally {
 *     dispose();
 *   }
 */
function combineWithTimeout(timeoutMs: number, external?: AbortSignal): [AbortSignal, () => void] {
  if (!external) {
    const signal = AbortSignal.timeout(timeoutMs);
    return [signal, () => { /* nothing to dispose; timeout signal is self-contained */ }];
  }
  const ac = new AbortController();
  if (external.aborted) {
    ac.abort(external.reason);
    return [ac.signal, () => { /* already aborted; nothing to do */ }];
  }
  const onExternal = () => ac.abort(external.reason);
  external.addEventListener("abort", onExternal, { once: true });
  const timer = setTimeout(() => {
    external.removeEventListener("abort", onExternal);
    ac.abort(new DOMException("timeout", "TimeoutError"));
  }, timeoutMs);
  const dispose = () => {
    clearTimeout(timer);
    external.removeEventListener("abort", onExternal);
  };
  return [ac.signal, dispose];
}

export interface CachedFetchResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  fromCache: boolean;
  redirectChain: string[];
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => { out[k.toLowerCase()] = v; });
  return out;
}

export async function cachedFetch(
  url: string,
  opts: CachedFetchOptions
): Promise<CachedFetchResult> {
  const fetcher: Fetcher = opts.fetcher ?? globalThis.fetch.bind(globalThis);
  const cache = opts.cache;

  if (!cache) {
    return performFetch(url, opts.timeoutMs, fetcher, cache, opts.signal, opts.validateHop, opts.followRedirects);
  }

  const existing = await readCacheEntry(cache.dir, url);
  if (existing && isRedirectPointer(existing)) {
    if (isCacheEntryFresh(existing.fetchedAt, cache.ttlMs)) {
      const target = await readCacheEntry(cache.dir, existing.redirectsTo);
      if (target && !isRedirectPointer(target)) {
        const targetTtl = shouldNegativeCache(target.status) ? NEGATIVE_CACHE_TTL_MS : cache.ttlMs;
        if (isCacheEntryFresh(target.fetchedAt, targetTtl)) {
          return { url: existing.redirectsTo, status: target.status, headers: target.headers, body: target.body, fromCache: true, redirectChain: [url] };
        }
      }
    }
  } else if (existing) {
    const effectiveTtl = shouldNegativeCache(existing.status) ? NEGATIVE_CACHE_TTL_MS : cache.ttlMs;
    const fresh = isCacheEntryFresh(existing.fetchedAt, effectiveTtl);
    const hasValidator = Boolean(existing.headers.etag ?? existing.headers["last-modified"]);

    if (fresh && !hasValidator) {
      return { url, status: existing.status, headers: existing.headers, body: existing.body, fromCache: true, redirectChain: [] };
    }

    if (hasValidator) {
      const condHeaders: Record<string, string> = {};
      if (existing.headers.etag) condHeaders["if-none-match"] = existing.headers.etag;
      if (existing.headers["last-modified"]) condHeaders["if-modified-since"] = existing.headers["last-modified"];
      const [signal, disposeSignal] = combineWithTimeout(opts.timeoutMs, opts.signal);
      let res: Response;
      try {
        res = await fetcher(url, {
          signal,
          headers: {
            ...condHeaders,
            "user-agent": PSEOLINT_USER_AGENT,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
      } finally {
        disposeSignal();
      }
      if (res.status === 304) {
        const updated: CacheEntry = { ...existing, fetchedAt: new Date().toISOString() };
        await writeCacheEntry(cache.dir, url, updated);
        return { url, status: existing.status, headers: existing.headers, body: existing.body, fromCache: true, redirectChain: [] };
      }
      const body = await res.text();
      const headers = headersToObject(res.headers);
      if (isStoreableStatus(res.status)) {
        await writeCacheEntry(cache.dir, url, {
          schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
          url, fetchedAt: new Date().toISOString(), status: res.status, headers, body,
        });
      }
      return { url, status: res.status, headers, body, fromCache: false, redirectChain: [] };
    }
  }

  return performFetch(url, opts.timeoutMs, fetcher, cache, opts.signal, opts.validateHop, opts.followRedirects);
}

const PSEOLINT_USER_AGENT = (() => {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    const v = pkg.version ?? "0";
    return `Mozilla/5.0 (compatible; pseolint/${v}; +https://pseolint.dev/bot)`;
  } catch {
    return "Mozilla/5.0 (compatible; pseolint; +https://pseolint.dev/bot)";
  }
})();

/** Cap on Retry-After honour — adversarial sites could declare hours. */
const RETRY_AFTER_MAX_MS = 30_000;

function parseRetryAfterMs(headerVal: string | null): number {
  if (!headerVal) return 0;
  const trimmed = headerVal.trim();
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && asNumber >= 0) return Math.min(RETRY_AFTER_MAX_MS, asNumber * 1000);
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    if (delta > 0) return Math.min(RETRY_AFTER_MAX_MS, delta);
  }
  return 0;
}

async function performFetch(
  url: string,
  timeoutMs: number,
  fetcher: Fetcher,
  cache: CacheConfig | null,
  externalSignal?: AbortSignal,
  validateHop?: (url: string) => Promise<void>,
  followRedirects: boolean = true,
): Promise<CachedFetchResult> {
  const redirectChain: string[] = [];
  let currentUrl = url;
  let backoffRetried = false;
  for (let hop = 0; hop < 10; hop += 1) {
    // Re-validate every hop when a validator is provided. An SSRF-clean
    // source URL can 302 to http://127.0.0.1/ — if we blindly followed
    // without re-checking, we'd hit loopback. `redirect: "manual"` below
    // ensures we control every hop; this call blocks malicious redirects.
    if (validateHop) await validateHop(currentUrl);

    const [signal, disposeSignal] = combineWithTimeout(timeoutMs, externalSignal);
    let res: Response;
    try {
      res = await fetcher(currentUrl, {
        signal,
        redirect: "manual",
        headers: { "user-agent": PSEOLINT_USER_AGENT, "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      });
    } finally {
      disposeSignal();
    }

    // Target-declared backoff — honor Retry-After on 429/503 once per URL.
    if ((res.status === 429 || res.status === 503) && !backoffRetried) {
      const waitMs = parseRetryAfterMs(res.headers.get("retry-after"));
      if (waitMs > 0) {
        backoffRetried = true;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
    }
    const status = res.status;
    if (status >= 300 && status < 400) {
      // When redirects are disabled, surface the 3xx as the final result with
      // the Location header intact so callers can inspect it.
      if (!followRedirects) {
        const headers = headersToObject(res.headers);
        const body = await res.text();
        return { url: currentUrl, status, headers, body, fromCache: false, redirectChain };
      }
      const loc = res.headers.get("location");
      if (!loc) break;
      let next: string;
      try {
        next = new URL(loc, currentUrl).href;
      } catch {
        throw new Error(`cachedFetch: invalid Location header "${loc}" at ${currentUrl}`);
      }
      if (redirectChain.includes(next)) {
        throw new Error(`cachedFetch: redirect loop detected at ${currentUrl} -> ${next}`);
      }
      if (cache) {
        await writeCacheEntry(cache.dir, currentUrl, {
          schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
          redirectsTo: next,
          fetchedAt: new Date().toISOString(),
          status,
        });
      }
      redirectChain.push(currentUrl);
      currentUrl = next;
      continue;
    }
    const body = await res.text();
    const headers = headersToObject(res.headers);
    if (cache && isStoreableStatus(status)) {
      await writeCacheEntry(cache.dir, currentUrl, {
        schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
        url: currentUrl, fetchedAt: new Date().toISOString(), status, headers, body,
      });
    }
    return { url: currentUrl, status, headers, body, fromCache: false, redirectChain: [...redirectChain] };
  }
  throw new Error(`cachedFetch: too many redirects for ${url}`);
}

/**
 * SSRF-guarded fetch for non-audit callers. Validates the source URL (and every
 * redirect hop) against the private-range blocklist via `validateTargetHost`,
 * applies the pseolint bot UA, and honours a per-request timeout + external
 * abort signal.
 *
 * Throws:
 *   - `SSRFError` if the target (or any redirect hop) resolves to a private
 *     / reserved range.
 *   - `DnsResolutionError` if the hostname doesn't resolve.
 *   - Network / timeout errors from the underlying fetch.
 *
 * Returns the same shape as `cachedFetch` (no cache is used; every call goes
 * to the origin). Intended for SaaS hosts that want an SSRF-safe fetch outside
 * the audit pipeline (metadata lookups, favicon fetches, screenshot URL
 * validation, etc.).
 */
export async function safeFetch(
  url: string,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    followRedirects?: boolean;
    fetcher?: Fetcher;
  } = {},
): Promise<CachedFetchResult> {
  const { validateTargetHost } = await import("./ssrf-guard.js");
  const validateHop = async (u: string): Promise<void> => {
    let host: string;
    try {
      host = new URL(u).hostname;
    } catch {
      throw new Error(`safeFetch: invalid URL ${u}`);
    }
    await validateTargetHost(host);
  };
  return cachedFetch(url, {
    timeoutMs: options.timeoutMs ?? 30000,
    cache: null,
    fetcher: options.fetcher,
    signal: options.signal,
    followRedirects: options.followRedirects ?? true,
    validateHop,
  });
}
