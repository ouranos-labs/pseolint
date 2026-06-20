# Pluggable Cache-Backend + R2 Cache (Spec B) — Design

**Date:** 2026-06-21
**Status:** approved (refined), pre-implementation
**Branch:** `feat/web-engine-surfacing` (off `main`; follows Spec A)

## Context

From the web-vs-core audit: hosted audits run with **no HTTP cache** because the engine's cache is filesystem-based (`CacheConfig = { dir, ttlMs }`; `cachedFetchInner`/`performFetch` read/write entries via `readCacheEntry(dir,url)`/`writeCacheEntry(dir,url,entry)`) and Vercel's filesystem is ephemeral. Decision (brainstorming): **clean build — a pluggable cache-backend interface in core, with a web R2 implementation.**

**Honest value framing (carried from brainstorming):** the monitoring state machine (`scrapePlan`) already *skips* unchanged URLs, so the cache's marginal value is **304-revalidation egress + origin-politeness savings on the pages that do get refetched** — the weekly *full* re-audit and manual dashboard re-audits of monitored domains. It is **not** a speed win in general (it adds an R2 GET per lookup). Because the value is marginal-but-real, this spec ships it **fail-safe, behind a kill-switch, and measured** so we can validate it post-deploy rather than assume.

## Goals / Non-goals

**Goals**
- A minimal `CacheBackend` storage interface in core; the existing fs path becomes the default backend, leaving every current caller (CLI) byte-for-byte unchanged.
- A web `R2CacheBackend` so monitored-domain re-audits reuse prior fetches via conditional (304) revalidation.
- Fail-safe (R2 errors never break an audit), kill-switchable, and measurable (via the existing `summary.cacheStats`).

**Non-goals**
- Caching one-shot/anonymous scans (single fetch → no reuse; avoids R2 churn).
- A CLI R2 backend (CLI keeps filesystem).
- Changing the revalidation/freshness/redirect logic — only the storage layer moves.
- R2-side pruning code (retention is an R2 lifecycle rule).

## Design

### 1. Core — `CacheBackend` interface (the only storage seam)
```ts
export interface CacheBackend {
  get(url: string): Promise<AnyCacheEntry | null>;
  set(url: string, entry: AnyCacheEntry): Promise<void>;
}
```
- `CacheConfig` gains `backend?: CacheBackend` (overrides `dir`). `dir` becomes optional.
- `cachedFetchInner`/`performFetch` resolve `const backend = cache.backend ?? new FilesystemCacheBackend(cache.dir!)` and call `backend.get/set` in place of the inline `readCacheEntry`/`writeCacheEntry` calls. **No revalidation/redirect/negative-cache logic changes.**
- `FilesystemCacheBackend(dir)` wraps the existing `readCacheEntry`/`writeCacheEntry` — same on-disk format, same behaviour. CLI and existing tests are unaffected.
- **Fail-safe wrapper:** `backend.get` throwing is treated as a miss; `backend.set` throwing is logged and swallowed. A cache backend can never abort or fail an audit. (Applies to every backend, so a flaky R2 degrades to "no cache," not a broken run.)
- Maintenance (`pruneCache`/`getCacheSizeInfo`) stays fs-specific (unchanged).

### 2. Web — `R2CacheBackend` (`apps/web/src/lib/r2-cache-backend.ts`)
Implements `CacheBackend` over the existing R2 lib:
- key = `audit-cache/<host>/<sha256(url)>` (per-domain prefix → scoped clear/inspect).
- `get`: R2 GetObject → JSON.parse → `AnyCacheEntry`; **null on miss OR any error**.
- `set`: PutObject(JSON.stringify(entry)); **best-effort, swallow errors**.
- No TTL logic in the backend — freshness stays in `cachedFetchInner` via `ttlMs` + `entry.fetchedAt`.

### 3. Wiring — `run-audit.ts`
- Construct the backend only on **monitored-domain** audits (re-audit, add-domain, monitoring cron — host known + a `monitoredDomains` row), gated by the kill-switch: `cache: r2CacheEnabled(host) ? { backend: new R2CacheBackend(host), ttlMs: CACHE_TTL_MS } : undefined`.
- One-shot/anon scans: no cache (unchanged).
- `r2CacheEnabled` returns false when `process.env.PSEOLINT_R2_CACHE_DISABLED` is set (ops kill-switch, no deploy needed). Default on.
- After the audit, log `summary.cacheStats` (hits/total/bytesSavedEstimate) via the existing `auditLog` so the hit rate is observable.

### 4. `AuditOptions.cache`
Add `backend?: CacheBackend`, threaded through `auditSource` into the `CacheConfig` it builds (so the auditor passes the backend down to `cachedFetch`). The auditor's `cache.dir ?? ".pseolint/cache"` default applies only when no backend is supplied.

### 5. Retention
An R2 bucket lifecycle rule expires `audit-cache/*` after ~30 days. Entries overwrite on refetch (fresh `fetchedAt`); stale ones age out. No custom pruning for R2.

## Testing
- **Core:** existing cache tests pass unchanged (they exercise `FilesystemCacheBackend` via `{dir,ttlMs}`). New: a fake in-memory `CacheBackend` proves (a) the get/set contract, (b) the 304-revalidation path is backend-agnostic (conditional request issued, 304 → `fromCache:true` + `_revalidated`), (c) the fail-safe wrapper turns a throwing backend into a clean cold-fetch.
- **Web:** `R2CacheBackend` get/set round-trip against a mocked R2 (hit, miss, malformed-JSON → null, error → null/no-throw).
- tsc clean (core + web); `next build` green; existing suites stay green.

## Risks
- **Latency/cost:** an R2 GET per cached lookup. Bounded by audit concurrency (5 default / 2 gentle), so a few seconds on a large re-audit — acceptable for async Inngest audits. Net value (egress/politeness) is **measured** via `cacheStats`; the kill-switch disables it if the data says it isn't worth it.
- **Correctness:** the cache stores HTTP responses, not audit results — orthogonal to ruleset/findings, so a ruleset change never serves stale verdicts.
- **R2 errors:** fully fail-safe (miss/no-op), so R2 flakiness degrades to "uncached," never a failed audit.
- **Backward compat:** `dir` made optional + `backend` added; all existing `{dir,ttlMs}` callers unchanged (covered by the untouched core cache tests).

## Deploy gates (carry into the plan)
- Add the R2 lifecycle rule expiring `audit-cache/*` (~30 days) on the prod bucket.
- (Kill-switch `PSEOLINT_R2_CACHE_DISABLED` is unset by default → cache on for monitored re-audits.)
