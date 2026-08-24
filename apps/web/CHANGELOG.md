# @pseolint/web

## 0.8.1

### Patch Changes

- Rank the newest audit per host on the leaderboard, not the newest passing one.

  The query filtered before deduplicating, and `DISTINCT ON (host)` runs over the
  already-filtered set. So a host whose newest audit scored at or above the risk
  cutoff did not drop off: Postgres returned its most recent PASSING audit
  instead. The site kept a score it no longer earned, and kept it until that older
  row expired.

  The comment directly above the query claimed the opposite ("a site that degrades
  below the bar drops off"), so this is the query being made to match its own
  documented intent rather than a change of policy. Patch, not minor, for that
  reason, though it is publicly visible: a degraded site now disappears from the
  listing instead of showing a stale number.

  Also adds `scripts/leaderboard-diagnose.ts`, a read-only funnel answering "why
  is this public site missing?". The listing applies eight gates plus an
  owner-hidden filter, so "public" and "listed" are very different populations and
  the gap is invisible from the page itself. It reports how many rows each gate
  removes, names every public host that is unlisted with the reason, and flags any
  host still being served a stale score.

## 0.8.0

### Minor Changes

- 1aed975: Publish `/folklore`, the list of checks pseolint deliberately does not run. Thirteen widely-repeated SEO rules that Google's own documentation contradicts (title and meta-description character limits, meta keywords, sitemap priority/changefreq, word-count minimums, the "2 MB total site size" misread), each with its primary source, its verdict, and the rule we run instead where a real documented failure sits nearby. Competing tools ship most of these, so refusing them with citations is a positioning asset rather than a missing feature, and it is the natural mirror of the existing blind-spots section on `/methodology`.

  The 13 entries live in `apps/web/src/lib/folklore.ts` and are the single source of truth: `bun run gen:folklore` regenerates `docs/folklore.md` from the same array, so the contributor doc and the public page cannot drift. The page carries FAQPage and BreadcrumbList JSON-LD, and is linked from `/methodology`, `sitemap.xml`, and `llms.txt`.

- 1aed975: Add `/rules` explainer pages for the 11 rules shipped in the folklore-vs-fact batch: `links/crawlable-anchors`, `links/generic-anchor-text`, `content/meta-description-presence`, `tech/language-mismatch`, `tech/hreflang-validity`, `tech/sitemap-hygiene`, `tech/meta-robots-conflict`, `tech/snippet-suppression`, `tech/robots-txt-limits`, `tech/html-size` and `tech/viewport-meta`. `llms.txt` advertised 59 rules while `/rules` indexed 29, so a crawler saw a claim it could not verify; the index, the dynamic route, the sitemap and the JSON-LD all derive from `MARKETING_RULES`, so the entries wire every surface at once.

  Each page documents the real implementation (thresholds, severities, and what the rule deliberately skips) and carries a worked example in its own domain, plus per-page authoritative citations. All 11 clear the existing dogfood contract in `marketing-rules.test.ts`, which runs pseolint's own engine over a reconstruction of every reference page: `spam/thin-content`, `content/unique-value`, `content/citation-coverage`, `content/common-phrase-reuse`, `aeo/content-modularity`, `aeo/answer-first`, `content/meta-uniqueness` and `aeo/citable-facts`.

- cd88581: Move the publish control from the report to the site, and make it stick.

  Publishing was per-audit and reachable only by opening a report. Every path
  that creates an audit for a monitored domain hardcoded `isPublic: false`: the
  three dashboard actions, the kickoff crawl in `lib/monitoring.ts`, and the
  `monitor-domains` cron. So publishing a report worked until the next scheduled
  run minted a fresh private audit, and the site silently dropped off the
  leaderboard. The symptom read as "the leaderboard is broken".

  `monitored_domain` gains an `is_public` column (migration 0023, default false)
  and all five insert paths inherit it, so the choice survives re-audits. The
  control now lives on `/dashboard/[host]` as a "Site visibility" card; a report
  for a monitored domain links there instead of offering a toggle that only sets
  one row. One-off audits keep their per-report toggle, having no site page.

  Publishing also extends retention. `run-audit` stamps permanent expiry only for
  audits eligible AT COMPLETION, and monitored audits complete private, so
  existing rows still carried a 30/90-day expiry: without this a freshly published
  site would list and then vanish when that clock ran out.

  The card states the leaderboard consequence before the click rather than after,
  and shows the two further bars (at least 5 pages, risk below 40) with whether
  this site currently meets them, so "public but not listed" is explained instead
  of looking broken.

  Also fixes a mangled tooltip on the report toggle, where an em-dash rewrite had
  moved a parenthesis across a ternary and produced "This report is public
  (anyone with the link can view it".

### Patch Changes

- 1aed975: Remove the SEO folklore our own marketing surfaces were publishing. The checklist tools told users to keep titles under 60 characters and meta descriptions between 140 and 155, which is exactly what `docs/folklore.md` and `/research/seo-folklore-vs-google-docs` document as unsupported: Google states no length limit for either, and SERP truncation is display-side cropping rather than an indexing event. Same-origin contradictions are a real citability problem for a product whose pitch is being cited by answer engines.

  Rewritten to check what the primary sources actually document (presence, uniqueness, and the quality triggers behind Google's title rewrites) across `/tools/programmatic-seo-checklist` (static + interactive), `/tools/nextjs-programmatic-seo`, and five code comments that carried the same belief. Also corrects blind-spots spec section 1.5, which had listed title-length detection as a gap to close, and drops the unsupported `host:` directive from `robots.txt` (flagged by our own new `tech/robots-txt-limits` rule when auditing pseolint.dev).

- 1aed975: Regenerate the OKF bundle so `/okf` and the MCP server's baked rule knowledge match the published catalog. `scripts/gen-okf.ts` derives from `MARKETING_RULES`, and that grew by 11 entries without the generator being re-run, so the statically-served bundle and `packages/mcp/src/okf-knowledge.ts` both sat at 31 rules while the catalog held 42. `llms.txt` points AI clients at `/okf/index.md` as one file per rule, so a stale bundle is an inventory claim the site cannot back.

  Also stops one number from drifting again: the folklore research article hard-coded "59 rules" in an FAQ answer and now reads `SCORED_RULE_COUNT` from the engine, the way `/methodology`, `llms.txt` and the landing-page rule ring already do.

- Updated dependencies [856c9f2]
- Updated dependencies [1aed975]
- Updated dependencies [1aed975]
- Updated dependencies [856c9f2]
- Updated dependencies [856c9f2]
- Updated dependencies [1aed975]
- Updated dependencies [1aed975]
- Updated dependencies [1aed975]
- Updated dependencies [1aed975]
- Updated dependencies [1aed975]
- Updated dependencies [1aed975]
- Updated dependencies [1aed975]
- Updated dependencies [1aed975]
- Updated dependencies [28f717a]
- Updated dependencies [1aed975]
  - @pseolint/core@0.8.0
  - pseolint@0.8.0
  - @pseolint/mcp@0.7.5

## 0.7.5

### Patch Changes

- Updated dependencies [0966c22]
- Updated dependencies [6231a7e]
  - @pseolint/core@0.7.5

## 0.7.4

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.7.4
  - @pseolint/mcp@0.7.4

## 0.7.3

### Patch Changes

- 3361782: v0.7.3: render-aware checks, AI content-effort, and bring-your-own inputs.

  Verdict moderators never change the raw `risk` number, so CI gates keyed off `--ci-threshold` stay stable.

  - **Bring-your-own authority.** New `--authority-score <0-100>` CLI flag and `authorityScore` config key, alongside the existing MCP `authorityScore` param and a per-domain setting in the Pro web dashboard. `>= 80` shifts the verdict one tier lenient, `<= 30` one tier stricter. The engine stays authority-blind by design.
  - **AI content-effort signal.** New `--content-effort` (+ `--content-effort-model`) CLI flag, `AuditOptions.contentEffort`, and an optional MCP `contentEffort` param. An LLM judges a 0-100 content originality/effort score from sampled page text (≤10 pages, content-hash cached) that moderates the verdict ±1 tier. Opt-in, needs `ANTHROPIC_API_KEY`, no-ops safely without one (~$0.003/page on claude-sonnet-4-6). Resolved score is written to `summary.contentEffort.score`. Runs automatically for Pro audits in the web app.
  - **Render-aware crawl checks.** `--render` (Playwright, Node-only) now feeds two render-diff rules: `tech/csr-bailout` flags pages whose substantive content/interactivity exists only after client-side JS (invisible to crawlers + the first indexing pass), and `tech/soft-404` probes one synthetic nonexistent URL per template cluster (an HTTP 200 means the directory will index unbounded junk). Both no-op without `--render` / outside programmatic directories.
  - **MCP rule knowledge as resources.** The MCP server now exposes the pSEO rule catalog as resources (`pseolint://rules` index + `pseolint://rules/<ruleId>` per-rule Markdown) so assistants can explain findings without guessing. The open knowledge bundle is also served at `/okf` and linked from `llms.txt`.

- Updated dependencies [3361782]
  - @pseolint/core@0.7.3
  - pseolint@0.7.3
  - @pseolint/mcp@0.7.3

## 0.7.2

### Patch Changes

- cc24997: fix(core): schema/consistency no longer false-positives on pages with multiple
  JSON-LD blocks.

  The v0.7.1 per-cluster rewrite compared the UNION of @types across a cluster, so
  a template where every page legitimately emits several blocks (e.g. TechArticle +
  FAQPage + Organization) read as "mixed types" and fired on every cluster (6 FPs
  on pseolint.dev's own audit). Now it compares each page's @type SET signature and
  fires only when pages in the same template cluster genuinely disagree.

- 3c9cb0d: fix(core): v0.7.2 rule-design batch: graded thresholds + presence-quality.

  Follow-up to the v0.7.1 FP-elimination batch, addressing the two deferred root
  causes (C: binary/absolute thresholds, D: presence-not-quality). Verified
  against the 24-fixture calibration corpus: zero new false positives vs the prior
  metrics, and the crawl-size verdict flips are gone.

  C, binary-threshold redesigns:

  - spam/boilerplate-ratio: continuous document-frequency weighting replaces the
    floor(N\*0.8)+1 skeleton cliff; 2-band severity. Verdict no longer flips when
    one more sibling page is crawled.
  - spam/template-diversity: log-bucketed coarsening of the structureSignature so
    single-template sites with minor chrome variation are no longer read as
    diverse (the exact-count signature shared with near-duplicate/doorway-pattern
    is untouched); confidence band.
  - content/value-add: continuous categoriesPresent/4 E-E-A-T sub-score replacing
    the 3-step hard-threshold value; 2-band severity (drops "critical").
  - content/wikipedia-paraphrase: min-length guard + threshold 0.40→0.55 above the
    legal/medical topic-overlap baseline; advisory language, stays low-confidence.

  D, presence-quality (validate the value, not just its presence):

  - schema/required-fields: empty arrays / whitespace / nameless author objects
    count as missing.
  - schema/json-ld-valid: @type accepts string OR all-string array
    (["Article","NewsArticle"] no longer false-positives).
  - tech/og-completeness: whitespace values count as missing; severity graded
    (title/description warning, image-only info).
  - content/eeat-signals: transparency signal reads contentText not raw html;
    about-link must be same-host.

- Updated dependencies [cc24997]
- Updated dependencies [3c9cb0d]
  - @pseolint/core@0.7.2
  - pseolint@0.7.2
  - @pseolint/mcp@0.7.2

## 0.7.1

### Patch Changes

- ce06ef7: v0.7.1: rule false-positive elimination batch (post unique-value design review).

  Stops the engine flagging healthy sites without weakening real detection. Each fix
  is TDD'd and validated against the reputable-pSEO fixtures.

  - **links/orphan-pages, links/cluster-connectivity**: suppressed on sampled crawls
    (the linking/target page is often un-fetched; reliable only on a full crawl).
  - **tech/canonical-consistency**: collapse "canonicalizes outside crawl scope" to
    one site-level note when all pages point at the same alternate host (staging/
    preview/localhost), instead of one finding per page; dedup HTTP-vs-HTML.
  - **tech/sitemap-completeness**: normalize sitemap URLs before the set-diff (kills
    trailing-slash/query false "missing"); demote the missing aggregate to warning.
  - **schema/consistency**: flag @type variance per template cluster (structureSignature),
    not site-wide (was a guaranteed FP on any multi-template site).
  - **aeo/crawler-access**: honor robots `Allow` directives per RFC 9309 (allow-all
    no longer reported as fully blocked).
  - **Severity/confidence bands**: error/critical demoted to warning on weak or
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

- v0.7.0: Off-page-authority disclosure + docs freshness

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
  watchdog aborts a crawl mid-flight (degraded origin), counts, risk, and the
  verdict are then lower bounds. The web app stored that summary to R2 and
  rendered it, but never surfaced the flag, so a degraded audit looked identical
  to a complete one.

  - `/r/[slug]` now renders a prominent partial-coverage warning banner above the
    hero when the R2 summary has `truncated === true`, including `truncatedReason`
    when present. This reads straight off the summary blob, no DB column needed.
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

- **Stream A: secondary marketing refresh (tools / rules / symptoms / pricing).**
  - **Tools page (`tools/page.tsx`):** new "How rules feed into per-template verdicts" section near the top: four bullet points explaining per-page→uniformity-score aggregation (`spam/thin-content`), corpus-wide non-template-scoped detection (`spam/near-duplicate`), per-page→template-level signal (`aeo/citable-facts` at 80% fire rate = one template finding), and site verdict via `siteVerdictFromTemplates` spec §15.1. Version reference updated to v0.6 throughout; comparison table "Audit limit" cell updated to K=10-per-template framing; SpamBrainaware column updated to "template-aware v0.6 engine; per-template verdicts". Version history paragraph updated to mention v0.6 template architecture.
  - **Rules page (`rules/page.tsx`):** new "Per-template aggregation: how rules feed verdicts" section before "How the rules map to SpamBrain"; describes Phase 1/Phase 2 pipeline, uniformity score, top driver concept, and the three aggregation patterns. Rule count updated to 32. Subtitle badge updated to "5 of 32 featured". Metadata description and footer CTA updated with per-template verdict language. FAQ answer updated to describe v0.6 per-template aggregation.
  - **Symptoms page (`symptoms/page.tsx`):** new "Template-level symptoms: the v0.6 failure modes" section above the existing triage section: three named symptom types: "Thin pages on a template" (uniformity score ≥0.8), "Cross-template duplication" (`spam/near-duplicate` corpus-wide), "One bad template among many" (worst-template ≥5% coverage = critical site verdict). Intro paragraph updated with K=10 per template framing and note that v0.6 identifies the responsible template. Triage section updated to say "which template and which rules" rather than "which URLs". FAQ answer updated to mention template identification.
  - **Pricing client (`pricing/pricing-client.tsx`):** `COMPARISON_ROWS`: "Pages per audit" row replaced with "Sampling model" showing K=10 vs K=20 distinction; new "Per-template verdict" row added; "Background monitoring" row updated to mention `template_degraded` alerts. `PRO_FEATURES` ("Unlimited monitored domains" detail updated with template_degraded mention; new "Per-template verdict) which template is broken" feature entry added (K=20/K=10 distinction, 8×10=80 fetches typical). "Free vs Pro" intro paragraph updated to reference `@pseolint/core 0.6.0` and T×K sampling model. "Why we chose this pricing" paragraph updated with v0.6 template engine mention and `siteVerdictFromTemplates`. Self-hosted FAQ updated to reference core 0.6.0. Free tier FAQ updated with K=10-per-template framing. Pricing metadata updated.
  - **`package.json`:** version 0.6.3 → 0.6.4.
  - **Regulatory groundings preserved across all pages:** SpamBrain, March 27 2026 core update, May 7 2024 site-reputation-abuse, March 5 2024 scaled-content-abuse: none stripped.

## 0.6.3

### Patch Changes

- **Stream C: marketing-surface refresh + TemplateBreakdownHero visual.**
  - **New component:** `src/components/landing/template-breakdown-hero.tsx`: v0.6 visual centerpiece. Renders a 3-card `<TemplateCard>` grid with realistic mock data (`/listing/:slug` 8201 URLs risk 60, `/category/:slug` 142 URLs risk 30, `/article/:slug` 89 URLs risk 12), an annotation callout explaining `siteVerdictFromTemplates` spec §15.1 (≥5% coverage rule), and a side-by-side v0.5 flat-sample vs v0.6 per-template comparison footer with colour-coded mini bar charts.
  - **Landing page (`page.tsx`):** hero badge updated to "Template-aware SpamBrain + AEO · v0.6.3"; H1 reframed around template auditing; hero description emphasises "which templates are broken"; `TemplateBreakdownHero` injected between the hero grid and the Scope section; "What pseolint is" bullet list updated with v0.6 template-audit framing + CI gate copy updated to "fails when a template degrades"; "By the numbers" bullets updated to mention templates explicitly (T × K sampling model, Pro monitoring description); STATS chip changed from "Free-tier pages" to "K per template (Pro) = 10 URLs"; bottom CTA updated to "per-template verdict".
  - **Methodology page (`methodology/page.tsx`):** new "How v0.6 audits work" section near the top: Phase 1 (template detection, filter ≥1%, ≥5 URLs, ≥2 survivors), Phase 2 (K=10/20 per template, 32 rules), aggregation (worst template ≥5% coverage), variance metric (uniformity score formula); ASCII two-phase pipeline diagram; version badge updated to v0.6.3.
  - **Limits page (`limits/page.tsx`):** Scope section updated: "K=10 per template" sampling model replaces flat-page counts; Pro monitoring run description now shows the T × K = 80 fetches typical figure; cumulative coverage copy updated "across all templates"; new "Why per-template?" callout box explains the v0.5→v0.6 cost-vs-coverage tradeoff; intro paragraph updated to reflect per-template language.
  - **`package.json`:** version at 0.6.3 (was 0.6.0).

## 0.6.0

### Minor Changes

- **Version-aligned with `@pseolint/core` 0.6.0**: the audit-as-template architectural cutover. Web app now ships at 0.6.0 to match the engine's "v0.6 stable" milestone. Functionally cumulative of all v0.0.x work since 0.0.10, plus the v0.6 cutover changes:
  - `<FindingsPanel>` now wrapped in a collapsed `<details>` element when the audit has ≥2 detected templates (template cards become primary surface, per-URL findings drill-down only). Legacy / single-template audits unchanged.
  - Tracks engine 0.5.11 → 0.6.0 cumulative changes that landed in apps/web through normal commits: GSC hotfix LIMIT 500, GSC origin-degradation autobind, template card grid (v0.5.10 phase 2), gentle-mode + auto-retry origin-degradation handling, AuditLogEvent additions (gsc.autobind._, gsc.rebind._, settings.domain.updated, audit.gentle_mode_applied).
- Web app remains private (not published to npm). Version bump is internal-coherence only: engine + dashboard are now versioned together.

## 0.0.10

### Patch Changes

- **v0.6 phase 2: per-template cards on the dashboard.** The per-domain dashboard now renders a responsive 1/2/3-column grid of `TemplateCard`s above the per-URL findings list when the audit's `summary.templates.length >= 2`. Each card shows: signature (mono title), grade chip (via `gradeOf(risk)`), top-driver one-line summary (`"8/10 samples fail spam/thin-content"`), URL coverage stat (`234 / 8200 URLs (2.9%)`), and a uniformity bar with red/yellow/green tints at 0.4/0.7 thresholds.
- **Drill-down via URL hash** (`#template=/listing/:slug`): clicking a card filters the per-URL findings list to that template's `auditedUrls` and survives reload + back/forward navigation. Clicking the active card or a "Clear filter" pill clears the selection.
- **Fallback unchanged.** Single-template sites, `unclear`/`small-marketing` classifications, and all pre-v0.5.9 audits keep the legacy per-URL-only view (the `>= 2 templates` gate from spec §15.3).
- **Persistence**: confirmed templates ride through R2 (the full `AuditSummary` JSON is serialized verbatim via `uploadSummary` + `fetchSummaryJson`). No DB migration. Old audits have `templates: []` and fall through cleanly.
- **`AuditLogEvent`** union extended with `template_degraded` event name; firing logic ships in v0.5.11.
- 14 new tests across `template-card.test.ts` + `dashboard-templates.test.ts`. Full suite: 97 pass (+14).

## 0.0.9

### Patch Changes

- **GSC live integration completed.** The rich GSC card on the per-domain dashboard (monthly trend, top templates, weighted-avg position, CTR) now renders live data for all connected GSC integrations. The card was already wired to query `gsc_page_metrics` and the daily Inngest cron (`sync-gsc.ts`, schedule `0 2 * * *` UTC) was already populating the table: but the 4 computed values were dropped at the `GscStatusStrip` callsite; one prop-wiring fix activates the rich variant.
- **On-demand GSC refresh.** New `POST /api/gsc/refresh/[host]` route fires a `gsc/sync-requested` Inngest event, handled by a new event-driven `sync-gsc-on-demand.ts` function. Rate-limited to 1/hour per user-host (effectively daily: bumpRateLimit's day-scoped key) to respect Google's 1200 QPD quota. Backed by a shared `lib/gsc-sync-core.ts` so cron and on-demand share the upsert path.
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
  with `force: { urls: [...] }`, gated by the same `DAILY_AUDIT_CAP` the
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
