# @pseolint/web

## 0.0.9

### Patch Changes

- **GSC live integration completed.** The rich GSC card on the per-domain dashboard (monthly trend, top templates, weighted-avg position, CTR) now renders live data for all connected GSC integrations. The card was already wired to query `gsc_page_metrics` and the daily Inngest cron (`sync-gsc.ts`, schedule `0 2 * * *` UTC) was already populating the table — but the 4 computed values were dropped at the `GscStatusStrip` callsite; one prop-wiring fix activates the rich variant.
- **On-demand GSC refresh.** New `POST /api/gsc/refresh/[host]` route fires a `gsc/sync-requested` Inngest event, handled by a new event-driven `sync-gsc-on-demand.ts` function. Rate-limited to 1/hour per user-host (effectively daily — bumpRateLimit's day-scoped key) to respect Google's 1200 QPD quota. Backed by a shared `lib/gsc-sync-core.ts` so cron and on-demand share the upsert path.
- 5 new tests in `tests/integration/gsc-sync.test.ts` covering the full error surface of `syncOneDomain` (auth refresh failures, 429 backoff, empty response, partial chunk, total quota exhaustion).

## 0.0.8

### Patch Changes

- `/api/audits` POST handler: Pro branch now uses the shared `assertProAuditAllowed` helper from `lib/audit-gate.ts` (introduced in v0.5.3). Removes ~40 LOC of inline gate duplication. Anon and free branches stay inline (different gate combinations). Status codes and response bodies unchanged; one Pro in-flight 429 message no longer interpolates `(count/limit)` since the helper doesn't surface those values (no test asserts the exact body). Picks up `@pseolint/core` 0.5.4 with the new `content/translation-no-op` rule.

## 0.0.7

### Patch Changes

- **Grade band labels aligned with engine verdict ladder.** `lib/grade.ts` band labels now match `verdictForRisk` vocabulary: B reads "caution" (was "good"), D reads "critical" (was "severe"), tones shifted to warning so a "B 37 / caution" visual mismatch is impossible. The bestfirenze.com self-audit revealed the misalignment.
- **Vitest server-only stub** (`tests/server-only-stub.ts` + `vitest.config.ts` alias). Lets server-side modules (`db/index.ts`, `lib/env.ts`, `lib/r2.ts`, etc.) load under vitest without throwing the Next.js client-component guard. Also re-pointed a stale `reserveAnonAuditSlot` import in `audit-rate-limit.test.ts` at `lib/anon-rate-limit.ts` (split out in 8499ad9).
- **Watched pages (Pro).** Pin up to 20 URLs per monitored domain; pinned URLs
  are force-refetched on every monitoring run regardless of diff-mode skip.
  New `watched_page` table (migration `0013_narrow_king_bedlam.sql`), server
  actions `addWatchedPage` / `removeWatchedPage` in
  `src/app/dashboard/domain-actions.ts` with full validation (SSRF guard,
  host-match against the monitored domain, www-equivalence, atomic 20-page
  cap, duplicate rejection). Adding a URL fires an immediate `audit/requested`
  with `force: { urls: [...] }` — gated by the same `DAILY_AUDIT_CAP` the
  public POST `/api/audits` route enforces, so the audit-on-add path can't
  bypass cost protection. When the daily cap is hit the watched row stays
  pinned and the URL audits on the next monitoring tick.
- **Engine force-include wiring.** `audit/requested` Inngest event payload
  now carries optional `force?: { urls?: string[] }`, threaded into
  `auditSource(...)` (consumes `@pseolint/core@0.5.3`). All four entry points
  pass watched URLs through: `monitor-domains.ts` cron, `lib/monitoring.ts`
  kickoff/re-activation, `domain-actions.ts` initial-add, and
  `domain-actions.ts` manual re-audit.
- **Cumulative coverage card.** Per-domain dashboard now surfaces total
  URLs audited across the full audit history (Postgres aggregate of
  `audits.pageCount`), with a 30-day-window sub-line. Hidden silently when
  a domain has no completed audit history. New `getCumulativeCoverage()` in
  `lib/monitoring.ts`; new component at
  `components/dashboard/cumulative-coverage-card.tsx`. `/limits` page copy
  updated to explain the cumulative-coverage framing for Pro monitoring.
- **Consolidated plan limits.** Daily caps (5/50), anon cap (3), Pro re-audit
  sample size (500), Pro monitoring sample size (200), and downgraded
  monitoring sample size (50) are now named constants
  (`DAILY_AUDIT_CAP`, `PRO_REAUDIT_SAMPLE_SIZE`, `PRO_MONITOR_SAMPLE_SIZE`,
  `DOWNGRADED_MONITOR_SAMPLE_SIZE`, `WATCHED_PAGES_CAP`) in
  `lib/audit-limits.ts`. Magic numbers eliminated from `audits/route.ts`,
  `monitoring.ts`, `domain-actions.ts`, `monitor-domains.ts`. The public-form
  300-cap vs dashboard-re-audit 500-cap split is now documented in code.
- New `auditLog` events: `watched_page.added`, `watched_page.removed`,
  `watched_page.cap_reached`.
- Updated dependencies
  - @pseolint/core@0.5.3

## 0.0.6

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.4.3
  - pseolint@0.4.3

## 0.0.5

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.4.2
  - pseolint@0.4.2

## 0.0.4

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.4.1
  - pseolint@0.4.1

## 0.0.3

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.4.0
  - pseolint@0.4.0

## 0.0.2

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.3.3
  - pseolint@0.3.1

## 0.0.1

### Patch Changes

- Updated dependencies [01627a8]
- Updated dependencies [bfcccc0]
  - @pseolint/core@0.3.0
  - pseolint@0.3.0
