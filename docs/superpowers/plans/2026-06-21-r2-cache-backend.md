# R2 Cache Backend (Spec B): Implementation Plan

**Spec:** `docs/superpowers/specs/2026-06-21-r2-cache-backend-design.md` (ce6c8f6)
**Branch:** `feat/web-engine-surfacing` (worktree `D:/phili/SSD_Projects/pseolint-web`)
**Cadence:** one commit per task. tsc (core + web) + tests + `next build` before the final commit.

Order matters: core interface (Task 1–3) before web (Task 4–5). The hard requirement throughout: **existing core cache behaviour and tests are unchanged**, only the storage seam moves.

---

## Task 1: core: `CacheBackend` interface + `FilesystemCacheBackend` + fail-safe + refactor
- In `packages/core/src/cache.ts`: add `export interface CacheBackend { get(url): Promise<AnyCacheEntry | null>; set(url, entry): Promise<void> }`.
- Add `class FilesystemCacheBackend implements CacheBackend` constructed with `dir`, delegating to the existing `readCacheEntry(dir,url)` / `writeCacheEntry(dir,url,entry)` (no format change).
- Extend `CacheConfig`: `dir?: string` (now optional) + `backend?: CacheBackend`.
- In `cachedFetchInner` + `performFetch`: resolve `const backend = cache.backend ?? new FilesystemCacheBackend(cache.dir!)` once, and replace every `readCacheEntry(cache.dir, …)` / `writeCacheEntry(cache.dir, …)` with `backend.get(…)` / `backend.set(…)`. **Do not touch** the freshness/validator/304/redirect/negative-cache logic.
- **Fail-safe:** wrap the backend calls so `get` throwing → treated as `null` (miss) and `set` throwing → logged (`console.error`) + swallowed. Cleanest: small private helpers `safeGet(backend,url)` / `safeSet(backend,url,entry)` used at the call sites.
- **Verify:** `tsc -p packages/core`; the existing core cache test suite passes unchanged (it drives `{dir,ttlMs}` → fs backend).
- **Commit:** `feat(core): pluggable CacheBackend (fs default): storage seam for cachedFetch`

## Task 2: core: thread `backend` through AuditOptions → auditSource
- `packages/core/src/types.ts`: add `backend?: CacheBackend` to `AuditOptions.cache` (import/re-export the type as needed; export `CacheBackend`, `AnyCacheEntry`, `FilesystemCacheBackend` from `src/index.ts`).
- `packages/core/src/auditor.ts` (~line 2280, where `cacheConfig` is built): pass `backend: options.cache.backend` through, and only default `dir` when no backend is supplied.
- **Verify:** `tsc -p packages/core`; cache tests still green.
- **Commit:** `feat(core): expose AuditOptions.cache.backend + CacheBackend exports`

## Task 3: core: fake-backend test
- `packages/core/tests/cache-backend.test.ts`: an in-memory `CacheBackend` (a `Map`). Assert (a) get/set round-trip via `cachedFetch({ cache: { backend, ttlMs } })`; (b) a stored entry with an ETag triggers a conditional request and a 304 returns `fromCache:true` + `_revalidated` (mock `fetcher`); (c) a backend whose `get`/`set` throw still yields a clean cold-fetch result (fail-safe).
- **Verify:** `npx vitest run tests/cache-backend.test.ts` green.
- **Commit:** `test(core): backend-agnostic cache contract + fail-safe (fake in-memory backend)`

## Task 4: web: `R2CacheBackend` + test
- `apps/web/src/lib/r2-cache-backend.ts`: `class R2CacheBackend implements CacheBackend` (import `CacheBackend`, `AnyCacheEntry` from `@pseolint/core`). Constructor takes `host`. Key = `audit-cache/${host}/${sha256(url)}` (reuse `cacheKeyFor` if exported, else a local sha256). `get` → R2 GetObject → `JSON.parse` → entry; return `null` on miss/parse-error/any error. `set` → PutObject(JSON); swallow errors. Reuse the existing R2 client/helpers in `apps/web/src/lib/r2.ts`.
- Note: run-audit is a Node/Inngest server module, so importing the `@pseolint/core` barrel here is fine (`serverExternalPackages`). **Do not** import core into any client-reachable module.
- `apps/web/src/lib/r2-cache-backend.test.ts`: mock the R2 client: assert get hit, get miss → null, malformed JSON → null, get/set error → null/no-throw, set round-trips the JSON.
- **Verify:** `tsc apps/web`; `npx vitest run src/lib/r2-cache-backend.test.ts`.
- **Commit:** `feat(web): R2CacheBackend (fail-safe R2-backed cache store)`

## Task 5: web: wire into run-audit (scoped, kill-switch, measured)
- In `apps/web/src/inngest/functions/run-audit.ts`: add `r2CacheEnabled(host): boolean` (false when `process.env.PSEOLINT_R2_CACHE_DISABLED` is set). For **monitored-domain** audit paths (host known + a `monitoredDomains` row: the same gate `authorityScore`/`renderMode` enrichments use), set `cache: r2CacheEnabled(host) ? { backend: new R2CacheBackend(host), ttlMs: WEB_CACHE_TTL_MS } : undefined` in the `auditSource` opts. One-shot/anon: leave `cache` unset.
- After the audit completes, `auditLog("audit.cache_stats", { auditId, host, hits, total, bytesSavedEstimate })` from `summary.cacheStats` (guard for absence).
- **Verify:** `tsc apps/web`.
- **Commit:** `feat(web): R2 cache on monitored-domain re-audits (kill-switch + cacheStats log)`

## Task 6: final verification
- `tsc` clean (core + apps/web); full core cache tests + new backend tests + web tests green; `next build` compiles + statically generates.
- **Commit:** none (verification only) unless fixes are needed.

## Deploy gates (ops, post-merge)
- R2 lifecycle rule: expire `audit-cache/*` after ~30 days on the prod bucket.
- `PSEOLINT_R2_CACHE_DISABLED` unset = cache on for monitored re-audits.
