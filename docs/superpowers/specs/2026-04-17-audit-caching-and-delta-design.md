# Audit Caching and Delta Mode Design

**Status:** Draft — 2026-04-17
**Author:** philippe.kam27@gmail.com + Claude (Opus 4.7)
**Motivation:** Repeated full crawls during dogfooding against PaperForge burned 448% of the 5 GB egress quota in a single session. Users will hit the same wall at scale. The current `discoveryBudget` mitigation (200 pages for remote default, 50+2× for sampled) is a band-aid that trades egress for sampling bias. This design replaces it with a proper caching and delta-audit foundation.

## Goal

Reduce audit egress by 10–100× on re-runs, eliminate sampling bias on first run, and unlock delta-mode audits for CI and monitoring — all via three composable shared primitives.

## Non-Goals

- **Hosted crawl service.** Belongs to the v2 "Layer 2" platform on the existing roadmap.
- **GSC / server-log / CDN-analytics integration.** v2 or later.
- **Long-running resumable jobs.** Our audits run in minutes, not hours. Recurrence is handled by external schedulers (cron, GitHub Actions `schedule:`) consuming our JSON output.
- **HEAD-only fetch path for header-only rules.** Only 2–3 of 35 rules could use it; not worth the fetch-layer branching.
- **Content-hash dedupe for analysis skip.** Saves CPU, not egress (we already fetched the bytes). Different problem.
- **Sitemap-index as stratification signal.** Indexes partition by product area (blog / docs / products), not by pSEO template. Adds complexity without useful signal for our audience.

## Architecture

Three primitives in the shared layer, then thin execution-mode wrappers on top.

### Primitive 1 — HTTP cache

**Location.** Opt-in via `--cache [dir]`. Default dir: `.pseolint/cache/`. When omitted, no caching (today's behavior).

**Storage.** Filesystem-backed. One file per cached URL.

**Cache key.** `sha256(url)` hex-encoded → filename. Prevents path traversal and filesystem-unsafe characters in URLs.

**Entry format.** JSON:

```json
{
  "url": "https://example.com/templates/lawyer-nda-ca",
  "fetchedAt": "2026-04-17T12:00:00Z",
  "status": 200,
  "headers": {
    "etag": "\"abc123\"",
    "last-modified": "Wed, 16 Apr 2026 10:00:00 GMT",
    "content-type": "text/html; charset=utf-8"
  },
  "body": "<!DOCTYPE html>..."
}
```

**Negative entries** (4xx) stored identically but `body` may be empty.

**Revalidation protocol.**

1. Compute key from URL. Check cache entry exists.
2. If no entry or entry expired (see below): full fetch, store entry.
3. If entry present and validators present (`etag` or `last-modified`): send conditional request with `If-None-Match` / `If-Modified-Since`. On 304: update `fetchedAt`, return cached body. On 200: overwrite entry. **This is the step that actually saves egress** — 304 responses are ~200 bytes vs full HTML.
4. If entry present but no validators (CDN stripped them): honor TTL only (`--cache-ttl`, default 7d). Fresh → return cached. Stale → full fetch.

**Negative caching.** 4xx responses cached with a 24h TTL regardless of server headers (prevents re-polling 404s during iteration). 5xx responses NOT cached (transient).

**Redirects.** Follow to final URL, cache the mapping: stored under the requesting URL's key, body is the final URL's content, add `"resolvedFrom"` chain to entry. Re-runs skip the hop chain.

**Atomicity.** Writes go to `<key>.tmp` then rename. Readers that encounter `.tmp` files ignore them.

**Size management.** Soft cap configurable via `--cache-max-mb` (default: unlimited). When exceeded, LRU eviction by `fetchedAt` until under cap. **Deferred to a follow-up task** — document the knob, but ship without eviction in v1; log a warning when cache exceeds 500 MB.

**Integration point.** All HTTP fetches in `packages/core/src/auditor.ts` (`fetchWithRetry`, `fetchTextStrict`, `fetchPageWithMeta`, and the robots/sitemap fetches at lines ~360, 383, 427, 548, 570, 603, 645, 721, 827) go through a new `cachedFetch(url, options)` wrapper. Wrapper is a no-op when cache is disabled.

**`cachedFetch` signature:**

```ts
type CachedFetchOptions = {
  timeoutMs: number;
  cache?: { dir: string; ttlMs: number } | null; // null = bypass cache entirely
  method?: "GET" | "HEAD"; // HEAD reserved for future, v1 only supports GET
};
type CachedFetchResult = {
  url: string; // final URL after redirects
  status: number;
  headers: Record<string, string>;
  body: string;
  fromCache: boolean; // true if served from cache (including 304 revalidation)
};
async function cachedFetch(url: string, opts: CachedFetchOptions): Promise<CachedFetchResult>;
```

### Primitive 2 — Run state

**Location.** `.pseolint/state.json`. Gitignored by default (`.pseolint/` added to `.gitignore` on first write). Docs show how to commit it for CI delta.

**Schema:**

```json
{
  "version": 1,
  "lastRun": "2026-04-17T12:00:00Z",
  "source": "https://example.com",
  "urls": {
    "https://example.com/templates/lawyer-nda-ca": {
      "contentHash": "sha256:...",
      "fetchedAt": "2026-04-17T12:00:00Z",
      "status": 200,
      "findingIds": ["content/thin-content", "meta/missing-description"]
    }
  },
  "summary": {
    "score": 42,
    "totalFindings": 308,
    "byCategory": { "content": 50, "spam": 120, ... }
  }
}
```

**`contentHash`** — `sha256` of the normalized HTML body (whitespace-collapsed, scripts stripped). Enables detecting "page changed since last run".

**`findingIds`** — per-URL list of rule IDs that fired. Enables detecting regressions (new rule ID on a URL) without storing full finding payloads.

**Schema versioning.** `version` field. On read, reject with actionable error if version unknown. Add migration function when we bump.

**Integration point.** Written at end of audit in `runAudit()` when `--state` is enabled. Read at start of audit when `--since <path>` or `--exit-on-regression` is enabled.

### Primitive 3 — Stratified sampling

**Purpose.** Replace today's `fisherYatesSample(urls, n)` with `stratifiedSample(urls, n)` that samples N per inferred template cluster rather than N uniformly across all URLs.

**URL-pattern inference.** Net-new helper `inferUrlTemplate(url): string`:

1. Parse URL path into segments.
2. For each segment, generalize:
   - All-digits → `:num`
   - UUID / ULID → `:id`
   - Date-shaped (`YYYY-MM-DD`) → `:date`
   - Hyphenated with 2+ hyphens (e.g., `lawyer-nda-ca`) → `:slug`
   - Everything else → kept literal
3. Join segments back: `/templates/lawyer-nda-ca` → `/templates/:slug`.

Length threshold intentionally dropped: pSEO slugs are often short (`nda-ca` → 2 hyphens → generalize). Literal-kept short static segments (`blog`, `about`, `pricing`) have 0 hyphens.

This is a heuristic — good enough for pSEO where URLs follow a template string. Not a replacement for true pattern mining.

**Stratification.**

1. Group URLs by `inferUrlTemplate(url)`.
2. If only one cluster exists (homogeneous site) OR all clusters have fewer than 3 URLs: fall back to uniform random (today's Fisher-Yates).
3. Otherwise: target `n` total samples. Allocate per cluster proportional to `sqrt(clusterSize)`, normalized so the allocations sum to `n`. Within each cluster, Fisher-Yates sample. This over-samples small clusters and under-samples large ones — better variance coverage than strict proportional allocation.

Example. Three clusters with sizes `[9000, 400, 100]`, target `n = 200`:
- `sqrt` values: `[94.9, 20.0, 10.0]` → `sum = 124.9`
- Normalized allocations: `[152, 32, 16]` (vs. proportional `[189, 8, 3]` which would barely sample the small clusters)
- So 16 URLs from the 100-URL cluster get sampled — enough to catch a bug that affects that template.

**Integration point.** Replace `fisherYatesSample` call at `packages/core/src/auditor.ts:860–862`. Keep `fisherYatesSample` as the within-cluster primitive.

### Execution modes (thin wrappers)

**`--cache [dir]`** — enables Primitive 1. Usable everywhere.

**`--cache-ttl <duration>`** — TTL for entries without validators. Default `7d`. Accepts `1h`, `30m`, `7d`, etc.

**`--strategy <random|stratified>`** — default `stratified` when `sampleSize` or `discoveryBudget` is active, else no-op (audit everything). Explicit `random` falls back to Fisher-Yates for reproducibility.

**`--max-per-template <N>`** — caps per-cluster samples. Composes with `--sample`.

**`--state [path]`** — enables Primitive 2. Default path `.pseolint/state.json`. Reads prior state at start (if file exists), writes new state at end. This is the single read/write flag.

**`--since`** — modifier on top of `--state`. When set, audit only URLs whose `contentHash` differs from the prior state OR are absent from prior state. Errors if no `--state` flag or if the state file does not exist.

**`--exit-on-regression`** — modifier on top of `--state`. Compares current findings against prior state's `findingIds`. Exits non-zero if any URL has a new rule ID in its findings. For monitoring via cron. Errors if no `--state` flag or if the state file does not exist.

Flag model rationale: one flag (`--state`) owns the file I/O; `--since` and `--exit-on-regression` are pure behavior modifiers. This avoids the "does `--since` also write?" ambiguity.

### Deprecation of `discoveryBudget`

The adaptive `discoveryBudget = 200` hack at `auditor.ts:807–814` is removed in favor of the cache + stratified sampling combo. Migration path:

- Users relying on implicit budget for remote URLs: cache warms after first run; subsequent runs are ~free. If they want to cap on first run, `--sample 200 --strategy stratified` is the explicit equivalent and samples better.
- No CLI surface change beyond the new flags.

## Data flow

```
runAudit(source, options)
  │
  ├─ if --since: read prior state, compute delta URL set
  ├─ discover URLs (sitemap / crawl) — unchanged
  ├─ stratifiedSample(urls, n, strategy)
  │
  ├─ for each url: cachedFetch(url)  ← Primitive 1
  │     ├─ cache hit + validators → conditional GET → 304 or 200
  │     ├─ cache hit + TTL fresh → return cached
  │     └─ cache miss / stale → full fetch, store
  │
  ├─ run rules → findings
  ├─ enrich findings — unchanged
  │
  ├─ if --state: write new state (hashes + findingIds + summary)
  └─ if --exit-on-regression: diff new findingIds against prior, exit code
```

## Testing strategy

- **Cache** (`packages/core/src/cache.test.ts`):
  - Cache miss writes entry, returns body
  - Cache hit with fresh ETag returns cached body without HTTP
  - Cache hit with stale ETag sends conditional GET; 304 returns cached; 200 overwrites
  - No-validators path honors TTL
  - 4xx stored with 24h TTL; 5xx not stored
  - Atomicity: interrupted write leaves `.tmp`, readers ignore
  - URL-hash key is path-traversal-safe (test with `../` in URL path)
- **State** (`packages/core/src/state.test.ts`):
  - Round-trip read/write preserves data
  - Version mismatch rejects with clear error
  - Content hash identical when HTML differs only in whitespace or script contents (normalization effective)
  - Content hash differs when visible text or attributes change
- **Stratified sampling** (`packages/core/src/stratified-sample.test.ts`):
  - `inferUrlTemplate` generalizes digits, slugs, UUIDs correctly
  - `inferUrlTemplate` keeps short static segments literal (`/blog/post` → `/blog/post`, not `/blog/:slug`)
  - Single-cluster URLs fall back to uniform random
  - Multi-cluster URLs sample per cluster proportional to `sqrt(size)`
  - Distribution test: 10k runs with seeded RNG, mean per-cluster count within ±5%
- **Integration** (`packages/core/src/auditor.test.ts`):
  - End-to-end audit with `--cache` cold → warm (assert HTTP calls drop to 0 on warm)
  - End-to-end audit with `--since prior-state.json` skips unchanged URLs
  - `--exit-on-regression` returns non-zero when new finding appears

## Security considerations

- **Path traversal.** URL → cache key via SHA-256 avoids filesystem-unsafe characters entirely. Reject any computed key containing `..`, `/`, or `\` as a defensive double-check.
- **Cache poisoning.** We treat cached responses as from the original server. No deserialization (body is stored as string, not eval'd). No risk beyond what `fetch()` already has.
- **State file tampering.** User-owned file. Schema validation on read prevents crashes from malformed JSON. Worst case: user corrupts own state → next run re-fetches.
- **Size DoS on malicious server.** A server could return a 100 MB body and fill the cache. Mitigation: `--cache-max-mb` knob documented; default unlimited; warning at 500 MB. Same risk exists today for audit memory — not net-new.

## Rollout plan

Ship as one coherent change in the following order (each phase lands user-visible value):

1. **Phase 1: Cache.** Primitive 1 alone. Solves the original dogfooding egress incident for us, and solves repeated re-run cost for any user. `--cache` opt-in initially; flip to default-on in a follow-up release after soak.
2. **Phase 2: Stratified sampling.** Primitive 3. Replaces `fisherYatesSample` in sampled path. Fixes sample bias that made 200-page audits miss template-specific issues. `--strategy stratified` default when sampling.
3. **Phase 3: State + delta modes.** Primitive 2 + `--state`, `--since`, `--exit-on-regression` flags. Unlocks CI diff mode and cron-friendly monitoring.
4. **Phase 4: Deprecate `discoveryBudget`.** Remove the adaptive 200-page budget. Document the migration.

All three primitives are independent and can ship in any order. The recommended order above lands user-visible wins earliest (Phase 1 immediately cuts egress for repeat runs). Phase 4 depends on Phases 1 and 2 being stable so users have working alternatives before we remove the old knob.

## Open questions

- **Default cache dir naming.** `.pseolint/cache/` vs `node_modules/.cache/pseolint/` (the second plays nicer with existing `.gitignore` setups but ties us to Node/npm ecosystem). **Decision: `.pseolint/` root, auto-add to `.gitignore` on first write.**
- **Cache format upgrade path.** Future versions may change entry format. **Decision: add `"schemaVersion": 1` to each cache entry; unknown versions are treated as cache miss (safer than hard error).**
- **State file name conflict with any other tool?** `.pseolint/state.json` is under our namespace dir — safe.

## Approval checklist

- [ ] Goal and non-goals accurate
- [ ] Three primitives match the agreed design
- [ ] Mode flags match user-facing shape we discussed
- [ ] Rollout phases ordered correctly
- [ ] Non-goals capture everything we explicitly rejected

Once approved, writing-plans will decompose this into tasks.
