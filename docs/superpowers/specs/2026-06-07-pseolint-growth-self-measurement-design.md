# pseolint.dev Growth Self-Measurement — Design Spec

**Date:** 2026-06-07
**Status:** Approved (design); pending spec review → implementation plan
**Related:** `docs/superpowers/specs/2026-06-06-pseolint-pseo-positioning-growth-design.md` (and its 2026-06-06 strategic refinement), slice-1/1b symptom-page plans.

## Problem

The refined growth strategy is **depth-first → measure → (maybe) data-moat engine**. The load-bearing dependency is *measurement*, but pseolint.dev currently has **no first-party measurement of its own growth**: no analytics (GA/Plausible), no first-party events, and its own organic search performance is not tracked anywhere. We therefore cannot answer the questions the strategy hinges on:

- Are the growth pages (`/symptoms/*`, `/rules/*`, `/tools/*`) getting **indexed**?
- Once indexed, do they earn **impressions → clicks**, and for **which queries**?
- (Later) Do those clicks **convert** to an audit run / signup?

Note: GSC integration already exists, but **only as a Pro feature** — a *customer* connects *their* GSC and the data grounds *their* audit (`gscPageMetrics`, `sync-gsc` cron, dashboard strip). None of that measures pseolint.dev's own marketing. This spec adds purpose-built **self-measurement**.

## Scope decision: acquisition first, conversion deferred

The domain is young and the growth pages just shipped, so there is little or no traffic to convert yet. Building a conversion funnel now would instrument traffic that does not exist. The leading indicator on a young domain is **acquisition** (indexation → impressions → clicks).

- **Phase 1 (this spec):** acquisition self-measurement + an internal dashboard that establishes the baseline.
- **Phase 2 (deferred, not designed here):** conversion funnel (growth page → run-audit → signup), triggered once weekly clicks cross a real threshold.

## Approach

**Purpose-built internal measurement that reuses the existing GSC OAuth/token code** (`@/lib/gsc.ts`: `loadGscTokens`, token refresh, API base), but writes to a **dedicated table** so marketing data never tangles with customer-domain audit grounding.

Rejected alternatives: (A) monitoring pseolint.dev as a "customer domain" via the Pro plumbing — page-dim only, runs an audit on our own marketing, wrong lens; (C) third-party analytics — adds client JS to our own SEO pages (we preach performance), external data dependency, split storage.

## Architecture & components

Each unit below has one responsibility and a well-defined interface.

### 1. Config (env)
Add three **optional** env vars (`@/lib/env.ts` zod schema, optional like `GOOGLE_CLIENT_ID`):
- `GROWTH_GSC_SITE_URL` — the GSC property for our own site, e.g. `sc-domain:pseolint.dev`.
- `GROWTH_GSC_OWNER_EMAIL` — the email of the user whose stored GSC integration tokens to use for the pull (resolved to `userId` via the `users` table).
- `OWNER_EMAILS` — comma-separated allowlist for the internal dashboard gate.

Self-measurement is **off by default**: if `GROWTH_GSC_SITE_URL` / `GROWTH_GSC_OWNER_EMAIL` are unset, the cron no-ops; if `OWNER_EMAILS` is unset, the dashboard denies everyone. No new OAuth — the owner connects pseolint.dev's property once through the existing `/api/integrations/gsc/connect` flow.

### 2. Data model — `growthSearchMetrics` table (`@/db/schema.ts`)
Separate from `gscPageMetrics`. Columns (follow existing table conventions — uuid pk, timestamps with tz):
```
id          uuid pk
url         text not null
query       text            -- nullable: page-only aggregate rows store NULL
weekBucket  text not null   -- ISO week key "YYYY-Www" (UTC)
impressions integer not null default 0
clicks      integer not null default 0
positionAvg numeric(6,2)
ctrAvg      numeric(6,4)
fetchedAt   timestamptz not null defaultNow()
unique (url, query, weekBucket)   -- NULL query = the page-level row
index  (weekBucket)
```
A Drizzle migration is generated for this table.

### 3. GSC query (`@/lib/gsc.ts`)
Add two pure-ish helpers alongside the existing ones:
- `querySearchAnalyticsByPageQuery(userId, siteUrl, startDate, endDate): Promise<GscPageQueryRow[]>` — same fetch shape as `querySearchAnalyticsByPage` but `dimensions: ["page","query"]`, `rowLimit: 5000`. Returns `{ url, query, clicks, impressions, ctr, position }[]`.
- `weekBucketUtc(d = new Date()): string` — ISO-week key `"YYYY-Www"` in UTC (mirrors `monthBucketUtc`).

### 4. Aggregation (pure function, unit-tested) — `@/lib/growth-metrics.ts`
- `aggregateGrowthRows(rows, { growthPrefixes }): { pageRows, pageQueryRows }`:
  - filters to URLs whose path starts with a growth prefix (`/symptoms`, `/rules`, `/tools`);
  - emits **page-level** rows (query = null, summed clicks/impressions, impression-weighted avg position, derived ctr) and the **top-N page+query** rows per page (N≈10, to bound table growth);
  - pure: rows in → rows out, no I/O. This is the core tested unit.
- `growthIndexationSummary(publishedUrls, metricRows)`: returns `{ published, withImpressions, indexationRatePct }` — "withImpressions" is our proxy for "indexed and surfacing". Published growth URLs are enumerated from the same data the routes render: `allSymptomSlugs()` → `/symptoms/<slug>`, `MARKETING_RULES` slugs → `/rules/<slug>`, `MARKETING_TOOLS` slugs → `/tools/<slug>` (all three are confirmed dynamic page-sets over those arrays).

### 5. Sync cron — `@/inngest/functions/sync-growth-metrics.ts`
`inngest.createFunction({ id: "sync-growth-metrics", retries: 1 }, { cron: "0 4 * * 1" }, …)` (weekly, Mondays 04:00 UTC). Steps:
1. No-op (return `{ skipped: "unconfigured" }`) if `GROWTH_GSC_SITE_URL`/`GROWTH_GSC_OWNER_EMAIL` unset.
2. Resolve owner email → `userId`; `loadGscTokens(userId)`; if null, audit-log + return `{ skipped: "no-grant" }`.
3. `rollingDateRange(28)` window stamped under the current `weekBucketUtc()` key. This is a weekly *snapshot of a trailing-28-day window* (same rationale as the Pro sync's 28-day-window-stamped-monthly: low-volume young-domain data is too sparse/noisy at a true 7-day window). "Week-over-week" therefore compares consecutive weekly snapshots, not disjoint 7-day slices — acceptable and explicitly intended.
4. `querySearchAnalyticsByPageQuery(...)` → `aggregateGrowthRows(...)`.
5. Upsert page rows + page+query rows into `growthSearchMetrics` (onConflict (url,query,weekBucket) → update), in chunks.
6. `markGscSynced(userId)` reused; `auditLog("growth.sync.*", …)`.
Register in the Inngest route (`@/app/api/inngest/route.ts`) alongside `syncGsc`.

### 6. Internal dashboard — `@/app/admin/growth/page.tsx`
- **Gate:** server component; read better-auth session (same pattern as `dashboard/[host]`); if `session.user.email` ∉ `OWNER_EMAILS` → `notFound()` (404, not a redirect — don't advertise the route). A small `requireOwner()` helper in `@/lib/owner.ts` centralizes the check and is unit-tested.
- **Content:** read latest few `weekBucket`s from `growthSearchMetrics`. Render:
  - headline **indexation rate** (`growthIndexationSummary`) — dogfoods our own `new-pages-not-getting-indexed` logic;
  - per growth URL: indexed? (has impressions), impressions, clicks, avg position, top queries, week-over-week delta;
  - totals + a simple sparkline of weekly clicks.
- No write actions; read-only.

### Kill-criteria
The dashboard **establishes the baseline**. We do **not** invent threshold numbers pre-traffic (the parent spec deliberately left them open). After ~4–8 weekly buckets exist, the deepen/widen/data-moat + kill-or-scale thresholds are set against real data in a follow-up.

## Data flow
GSC API (own property, page+query) → `querySearchAnalyticsByPageQuery` → `aggregateGrowthRows` (filter to growth prefixes, page + top-N page-query) → upsert `growthSearchMetrics` (weekly cron) → `/admin/growth` reads latest buckets → indexation rate + per-URL acquisition + WoW trend.

## Error handling
- Unconfigured / no-grant / GSC API failure: cron logs via `auditLog` and returns a skip/fail summary rather than throwing (one failure must not wedge the schedule), mirroring `sync-gsc`'s per-target isolation.
- Token refresh failures surface as "no-grant" (re-grant needed); same as existing behavior.
- Dashboard with no data yet: render an explicit "no data for this week — first sync runs Monday" empty state, not an error.

## Testing
- **Unit (core):** `aggregateGrowthRows` — prefix filtering, page-level summation, impression-weighted avg position, top-N page-query selection, empty input. `growthIndexationSummary` — ratio math, zero-published guard. `weekBucketUtc` — known dates incl. year boundary. `requireOwner` — allowed / denied / empty-allowlist / unset-env.
- **Integration:** cron upserts expected rows given a mocked GSC API response (follow `tests/integration/gsc-sync.test.ts`); unconfigured → skip; no-grant → skip.
- No live GSC calls in tests (mock `fetch`/the query fn).

## Non-goals (now)
- Conversion funnel / first-party event tracking (Phase 2).
- Third-party analytics (GA/Plausible/PostHog).
- Any change to the Pro GSC feature, `gscPageMetrics`, or the customer dashboard.
- Dimensions beyond page + query (no country/device); pagination beyond 5000 rows (heavy-headed traffic, same rationale as the Pro sync).
- Public exposure of the growth dashboard (owner-only).

## Open questions
- None blocking. (`/symptoms`, `/rules`, `/tools` confirmed as enumerable page-sets; week-bucket semantics resolved above. ISO-week key chosen; revisit only if it complicates the WoW query.)
