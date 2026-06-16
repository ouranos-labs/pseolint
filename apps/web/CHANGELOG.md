# @pseolint/web

## 0.7.1

### Patch Changes

- ce06ef7: v0.7.1 — rule false-positive elimination batch (post unique-value design review).

  Stops the engine flagging healthy sites without weakening real detection. Each fix
  is TDD'd and validated against the reputable-pSEO fixtures.

  - **links/orphan-pages, links/cluster-connectivity** — suppressed on sampled crawls
    (the linking/target page is often un-fetched; reliable only on a full crawl).
  - **tech/canonical-consistency** — collapse "canonicalizes outside crawl scope" to
    one site-level note when all pages point at the same alternate host (staging/
    preview/localhost), instead of one finding per page; dedup HTTP-vs-HTML.
  - **tech/sitemap-completeness** — normalize sitemap URLs before the set-diff (kills
    trailing-slash/query false "missing"); demote the missing aggregate to warning.
  - **schema/consistency** — flag @type variance per template cluster (structureSignature),
    not site-wide (was a guaranteed FP on any multi-template site).
  - **aeo/crawler-access** — honor robots `Allow` directives per RFC 9309 (allow-all
    no longer reported as fully blocked).
  - **Severity/confidence bands** — error/critical demoted to warning on weak or
    forecast signals: thin-content medium band, summary-bait, translation-no-op,
    entity-swap (low mask coverage), soft-404 (OR-weighted confidence model).

  Note: bundled as a patch (0.x) despite a behavior/scoring shift and the
  `rules.uniqueValueMinWords` → `rules.uniqueValueDensity` config rename.

- Updated dependencies [d9797e4]
- Updated dependencies [ce06ef7]
  - @pseolint/core@0.7.1
  - pseolint@0.7.1
  - @pseolint/mcp@0.7.1

## 0.7.0

### Minor Changes

- v0.7.0 — Off-page-authority disclosure + docs freshness

  - `/limits` now discloses the off-page-authority blind spot: pseolint measures on-page structural risk and cannot see the off-page authority and user-behaviour signals Google weighs most heavily, so a thin templated page on a high-authority domain may rank fine while a clean-looking page can still be suppressed.
  - Version, rule-count, and scoring-model copy synced across the app to the current engine (44 rules across 8 categories; the v0.4 super-category verdict model).

### Patch Changes

- Updated dependencies [ba1c6ca]
- Updated dependencies
  - @pseolint/core@0.7.0
  - pseolint@0.7.0
  - @pseolint/mcp@0.7.0

## 0.6.7

### Patch Changes

- Updated dependencies [44d018f]
- Updated dependencies [ea4e822]
  - @pseolint/core@0.6.6

## 0.6.6

### Patch Changes

- surface partial (`truncated`) audits in the web app

  The core engine flushes a `truncated: true` report when its backpressure
  watchdog aborts a crawl mid-flight (degraded origin) — counts, risk, and the
  verdict are then lower bounds. The web app stored that summary to R2 and
  rendered it, but never surfaced the flag, so a degraded audit looked identical
  to a complete one.

  - `/r/[slug]` now renders a prominent partial-coverage warning banner above the
    hero when the R2 summary has `truncated === true`, including `truncatedReason`
    when present. This reads straight off the summary blob — no DB column needed.
  - The `audit` table gains `truncated` (boolean, default false) and
    `truncated_reason` (text) columns (migration `0021_loud_emma_frost`), mirrored
    from `AuditSummary` in the run-audit completion update so degraded audits are
    queryable/filterable without round-tripping R2.
  - The per-domain workspace (`/dashboard/[host]`) shows a small "⚠ Partial" badge
    next to the latest-audit header when the run was truncated.

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @pseolint/core@0.6.5
  - @pseolint/mcp@0.6.5
  - pseolint@0.6.4

## 0.6.5

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.6.4

## 0.6.4

### Patch Changes

- **Stream A — secondary marketing refresh (tools / rules / symptoms / pricing).**
  - **Tools page (`tools/page.tsx`):** new "How rules feed into per-template verdicts" section near the top — four bullet points explaining per-page→uniformity-score aggregation (`spam/thin-content`), corpus-wide non-template-scoped detection (`spam/near-duplicate`), per-page→template-level signal (`aeo/citable-facts` at 80% fire rate = one template finding), and site verdict via `siteVerdictFromTemplates` spec §15.1. Version reference updated to v0.6 throughout; comparison table "Audit limit" cell updated to K=10-per-template framing; SpamBrainaware column updated to "template-aware v0.6 engine; per-template verdicts". Version history paragraph updated to mention v0.6 template architecture.
  - **Rules page (`rules/page.tsx`):** new "Per-template aggregation — how rules feed verdicts" section before "How the rules map to SpamBrain" — describes Phase 1/Phase 2 pipeline, uniformity score, top driver concept, and the three aggregation patterns. Rule count updated to 32. Subtitle badge updated to "5 of 32 featured". Metadata description and footer CTA updated with per-template verdict language. FAQ answer updated to describe v0.6 per-template aggregation.
  - **Symptoms page (`symptoms/page.tsx`):** new "Template-level symptoms — the v0.6 failure modes" section above the existing triage section — three named symptom types: "Thin pages on a template" (uniformity score ≥0.8), "Cross-template duplication" (`spam/near-duplicate` corpus-wide), "One bad template among many" (worst-template ≥5% coverage = critical site verdict). Intro paragraph updated with K=10 per template framing and note that v0.6 identifies the responsible template. Triage section updated to say "which template and which rules" rather than "which URLs". FAQ answer updated to mention template identification.
  - **Pricing client (`pricing/pricing-client.tsx`):** `COMPARISON_ROWS` — "Pages per audit" row replaced with "Sampling model" showing K=10 vs K=20 distinction; new "Per-template verdict" row added; "Background monitoring" row updated to mention `template_degraded` alerts. `PRO_FEATURES` — "Unlimited monitored domains" detail updated with template_degraded mention; new "Per-template verdict — which template is broken" feature entry added (K=20/K=10 distinction, 8×10=80 fetches typical). "Free vs Pro" intro paragraph updated to reference `@pseolint/core 0.6.0` and T×K sampling model. "Why we chose this pricing" paragraph updated with v0.6 template engine mention and `siteVerdictFromTemplates`. Self-hosted FAQ updated to reference core 0.6.0. Free tier FAQ updated with K=10-per-template framing. Pricing metadata updated.
  - **`package.json`:** version 0.6.3 → 0.6.4.
  - **Regulatory groundings preserved across all pages:** SpamBrain, March 27 2026 core update, May 7 2024 site-reputation-abuse, March 5 2024 scaled-content-abuse — none stripped.

## 0.6.3

### Patch Changes

- **Stream C — marketing-surface refresh + TemplateBreakdownHero visual.**
  - **New component:** `src/components/landing/template-breakdown-hero.tsx` — v0.6 visual centerpiece. Renders a 3-card `<TemplateCard>` grid with realistic mock data (`/listing/:slug` 8201 URLs risk 60, `/category/:slug` 142 URLs risk 30, `/article/:slug` 89 URLs risk 12), an annotation callout explaining `siteVerdictFromTemplates` spec §15.1 (≥5% coverage rule), and a side-by-side v0.5 flat-sample vs v0.6 per-template comparison footer with colour-coded mini bar charts.
  - **Landing page (`page.tsx`):** hero badge updated to "Template-aware SpamBrain + AEO · v0.6.3"; H1 reframed around template auditing; hero description emphasises "which templates are broken"; `TemplateBreakdownHero` injected between the hero grid and the Scope section; "What pseolint is" bullet list updated with v0.6 template-audit framing + CI gate copy updated to "fails when a template degrades"; "By the numbers" bullets updated to mention templates explicitly (T × K sampling model, Pro monitoring description); STATS chip changed from "Free-tier pages" to "K per template (Pro) = 10 URLs"; bottom CTA updated to "per-template verdict".
  - **Methodology page (`methodology/page.tsx`):** new "How v0.6 audits work" section near the top — Phase 1 (template detection, filter ≥1%, ≥5 URLs, ≥2 survivors), Phase 2 (K=10/20 per template, 32 rules), aggregation (worst template ≥5% coverage), variance metric (uniformity score formula); ASCII two-phase pipeline diagram; version badge updated to v0.6.3.
  - **Limits page (`limits/page.tsx`):** Scope section updated — "K=10 per template" sampling model replaces flat-page counts; Pro monitoring run description now shows the T × K = 80 fetches typical figure; cumulative coverage copy updated "across all templates"; new "Why per-template?" callout box explains the v0.5→v0.6 cost-vs-coverage tradeoff; intro paragraph updated to reflect per-template language.
  - **`package.json`:** version at 0.6.3 (was 0.6.0).

## 0.6.0

### Minor Changes

- **Version-aligned with `@pseolint/core` 0.6.0** — the audit-as-template architectural cutover. Web app now ships at 0.6.0 to match the engine's "v0.6 stable" milestone. Functionally cumulative of all v0.0.x work since 0.0.10, plus the v0.6 cutover changes:
  - `<FindingsPanel>` now wrapped in a collapsed `<details>` element when the audit has ≥2 detected templates (template cards become primary surface, per-URL findings drill-down only). Legacy / single-template audits unchanged.
  - Tracks engine 0.5.11 → 0.6.0 cumulative changes that landed in apps/web through normal commits: GSC hotfix LIMIT 500, GSC origin-degradation autobind, template card grid (v0.5.10 phase 2), gentle-mode + auto-retry origin-degradation handling, AuditLogEvent additions (gsc.autobind._, gsc.rebind._, settings.domain.updated, audit.gentle_mode_applied).
- Web app remains private (not published to npm). Version bump is internal-coherence only — engine + dashboard are now versioned together.

## 0.0.10

### Patch Changes

- **v0.6 phase 2 — per-template cards on the dashboard.** The per-domain dashboard now renders a responsive 1/2/3-column grid of `TemplateCard`s above the per-URL findings list when the audit's `summary.templates.length >= 2`. Each card shows: signature (mono title), grade chip (via `gradeOf(risk)`), top-driver one-line summary (`"8/10 samples fail spam/thin-content"`), URL coverage stat (`234 / 8200 URLs (2.9%)`), and a uniformity bar with red/yellow/green tints at 0.4/0.7 thresholds.
- **Drill-down via URL hash** (`#template=/listing/:slug`) — clicking a card filters the per-URL findings list to that template's `auditedUrls` and survives reload + back/forward navigation. Clicking the active card or a "Clear filter" pill clears the selection.
- **Fallback unchanged.** Single-template sites, `unclear`/`small-marketing` classifications, and all pre-v0.5.9 audits keep the legacy per-URL-only view (the `>= 2 templates` gate from spec §15.3).
- **Persistence**: confirmed templates ride through R2 (the full `AuditSummary` JSON is serialized verbatim via `uploadSummary` + `fetchSummaryJson`). No DB migration. Old audits have `templates: []` and fall through cleanly.
- **`AuditLogEvent`** union extended with `template_degraded` event name; firing logic ships in v0.5.11.
- 14 new tests across `template-card.test.ts` + `dashboard-templates.test.ts`. Full suite: 97 pass (+14).

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
