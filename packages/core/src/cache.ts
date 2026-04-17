import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
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
}

export interface CachedFetchResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  fromCache: boolean;
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

  // Cache disabled → direct fetch
  if (!cache) {
    const res = await fetcher(url, { signal: AbortSignal.timeout(opts.timeoutMs) });
    return {
      url,
      status: res.status,
      headers: headersToObject(res.headers),
      body: await res.text(),
      fromCache: false,
    };
  }

  // Try cache
  const existing = await readCacheEntry(cache.dir, url);

  if (existing && !isRedirectPointer(existing)) {
    const effectiveTtl = shouldNegativeCache(existing.status) ? NEGATIVE_CACHE_TTL_MS : cache.ttlMs;
    const fresh = isCacheEntryFresh(existing.fetchedAt, effectiveTtl);
    const hasValidator = Boolean(existing.headers.etag ?? existing.headers["last-modified"]);

    if (fresh && !hasValidator) {
      return { url, status: existing.status, headers: existing.headers, body: existing.body, fromCache: true };
    }

    if (hasValidator) {
      const condHeaders: Record<string, string> = {};
      if (existing.headers.etag) condHeaders["if-none-match"] = existing.headers.etag;
      if (existing.headers["last-modified"]) condHeaders["if-modified-since"] = existing.headers["last-modified"];
      const res = await fetcher(url, {
        signal: AbortSignal.timeout(opts.timeoutMs),
        headers: condHeaders,
      });
      if (res.status === 304) {
        const updated: CacheEntry = { ...existing, fetchedAt: new Date().toISOString() };
        await writeCacheEntry(cache.dir, url, updated);
        return { url, status: existing.status, headers: existing.headers, body: existing.body, fromCache: true };
      }
      const body = await res.text();
      const headers = headersToObject(res.headers);
      if (res.status < 500) {
        const entry: CacheEntry = {
          schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
          url,
          fetchedAt: new Date().toISOString(),
          status: res.status,
          headers,
          body,
        };
        await writeCacheEntry(cache.dir, url, entry);
      }
      return { url, status: res.status, headers, body, fromCache: false };
    }
  }

  // Cache miss or stale-without-validator → full fetch
  const res = await fetcher(url, { signal: AbortSignal.timeout(opts.timeoutMs) });
  const body = await res.text();
  const headers = headersToObject(res.headers);
  if (res.status < 500) {
    const entry: CacheEntry = {
      schemaVersion: CACHE_ENTRY_SCHEMA_VERSION,
      url,
      fetchedAt: new Date().toISOString(),
      status: res.status,
      headers,
      body,
    };
    await writeCacheEntry(cache.dir, url, entry);
  }
  return { url, status: res.status, headers, body, fromCache: false };
}
