# Changelog

Changelog for `pseolint`, `@pseolint/core`, and `@pseolint/mcp`. All three packages version together.

## Unreleased: Crawler-legibility detection

- **`tech/csr-bailout` (new rule).** With `--render`, diffs the raw server HTML against the post-hydration DOM and flags pages whose interactive value (or substantive content) appears only after client-side JS: invisible to crawlers and Google's first indexing pass. High confidence when interactive elements are entirely absent from the server HTML; emits Next.js-specific remediation (wrap `useSearchParams()`/dynamic hooks in `<Suspense>`; keep `new Date()`/`Math.random()` out of client render paths under `cacheComponents`; verify with `next build && next start`, not `next dev`). Down-weighted to `info` on `small-marketing`. No-op without `--render`.
- **`tech/soft-404` synthetic probe.** On programmatic directories, probes one invented (nonexistent) URL per template cluster; an HTTP 200 response is flagged as a soft-404 (otherwise crawlers index unbounded junk). One probe per cluster, capped, robots-respecting, fail-open.
- **Render pipeline wired.** The previously-unused `renderPages()` (Playwright) is now invoked under `--render`, populating `ParsedPage.renderedHtml`. Node-only (not bun); requires a matching Chromium (`npx playwright install chromium-headless-shell`) or a CDP endpoint, and degrades gracefully to a static audit when neither is available.

## 0.7.0: 2026-06-13 - Calibration & authority foundations

The whole product line is realigned to a single **0.7.0** version (core, CLI, MCP, web, and the GitHub Action). The 0.6.x line was tracked in the per-package changelogs; this entry re-establishes the unified narrative.

**Measurement.** A two-sided calibration harness scores the engine against a labeled corpus of real winning and penalized pSEO sites. The new `calibrationMetrics()` instrument reports, threshold-free, how well the risk score tracks the real outcome (AUC, class-separation gap, per-band empirical penalty rate, and the over-flag / recall-leak confusion-zone sites) with a `detectability` field that separates the engine's addressable ceiling from structurally-undetectable (off-page) cases. The first measurement was honest and sobering: on-page structural risk alone tracks the real outcome at roughly chance, because the deciding factor is off-page authority the engine can't see.

**Engine.** Corpus-derived entity auto-masking (`deriveEntityPatterns`) clusters pages by URL template and masks tokens that vary across siblings, lifting policy-violating recall (44% → 56%) and fixing the reputable-vs-spam risk inversion. Domain-authority moderation scaffolding lands as a pluggable `AuthorityProvider` (`CompositeAuthorityProvider`, `OpenPageRankProvider`, `CommonCrawlProvider`) feeding the existing verdict-shift, a fail-safe no-op until an authority source is configured. `checkOriginHealth()` adds a concurrent, SSRF-safe pre-flight origin probe that drops a degraded origin to gentle mode before a crawl piles on.

**Web.** `/limits` now discloses the off-page-authority blind spot. Version, rule-count, and scoring-model copy is synced across the app to the current engine (44 rules across 8 categories; the v0.4 super-category verdict model).

## 0.5.2: 2026-05-03 - Credibility layer

This release shipped after empirically calibrating the engine against a
corpus of reputable, in-production pSEO sites (Zapier, G2, Wise,
NerdWallet, Webflow, Typeform, Segment, Jasper, Ramp, Numbeo, Airbyte,
Stripe Atlas) over 9 iteration rounds. The headline outcome: **pass
rate on reputable pSEO went from 33% to 78%, and 5 of 9 audited sites
now score `ready`** (best possible verdict). Every change is documented
with the calibration finding that motivated it.

### Added

- **Calibration framework.**
  - `packages/core/calibration/reputable-pseo-corpus.json`: 12-site
    curated corpus with ground-truth verdict ceilings.
  - `scripts/calibration-reputable-pseo.ts`: runner. Run with
    `bun run scripts/calibration-reputable-pseo.ts`. Outputs JSON +
    markdown report.
  - `packages/core/tests/calibration/reputable-corpus.test.ts`: soft
    regression gate. Skips when results are missing or >14 days stale.
  - Spec at `docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md`
    with the full iteration story.
- **Sample-seed determinism.** New `AuditOptions.sampleSeed`. When set,
  the stratified sampler picks the same pages across runs (mulberry32
  PRNG plumbed through `stratifiedSample` and `fisherYatesSample`),
  letting CI gates and calibration get reproducible verdicts.
- **`spam/doorway-pattern` cluster collapse.** The rule now emits in
  the same `pageUrl` + `relatedUrls[0]` pair shape as `spam/near-
  duplicate`, and is registered in `CLUSTERABLE_RULES`. C(N,2) per-pair
  findings collapse into one cluster finding per template-tied group:
  Segment's 276-pair audit now shows 1 cluster line instead of 276.
- **Info-severity bucket cap.** Cumulative info-severity contribution
  per category bucket is capped at 50 (warning+ contribution still caps
  at 100; final bucket = sum, capped at 100). A flood of info findings
  can no longer fill the bucket cap and tank the verdict on its own.
  Resolves the "all info findings → concerning" verdict-to-findings
  disconnect surfaced on Airbyte's connectors directory.
- **Markdown formatter: collapse informational findings under
  `<details>`.** Reports rendered as PR comments no longer drown the
  actionable list (blockers + should-fix) in 100+ info bullets. The
  count is preserved in the summary line.
- **`links/host-section-divergence`.** Site-reputation-abuse detector,
  pulled forward from v0.5.1.

### Changed

- **Site-classifier-aware severity demotions.** All four scoring
  profiles (`small-marketing`, `programmatic-directory`, `unclear`,
  with the existing `docs`/`ecommerce` retained) now demote rules that
  are structurally incompatible with non-prose / catalog-shape pages:
  `aeo/citable-facts`, `aeo/answer-first`, `aeo/content-modularity`,
  `aeo/freshness-signals`, `content/missing-author`, `content/eeat-
  signals` to `info`; `spam/template-diversity`, `spam/boilerplate-
  ratio`, `spam/near-duplicate`, `spam/doorway-pattern` to `warning`.
- **`unclear` profile philosophy reversed.** Was "stay strict when
  unsure" (zero overrides), is now "demote AEO + EEAT conservatively
  because most reputable pSEO sites mis-classify as unclear at <70%
  confidence." A site that's actually editorial sees the signals as
  info; a site that's actually a catalog doesn't tank.
- **`spam/doorway-pattern` requires a content-quality signal.** Was
  ≥3 of 5 signals; now ≥3 AND at least one of (thin-content OR
  identical-meta). Catalog pages are by-design near-dup + entity-swap
  + identical-structure: three structural signals shouldn't constitute
  a doorway finding.
- **`tech/hreflang-consistency`.** Reciprocity check now skips when the
  target page wasn't in the crawl sample (was firing 385× on a 25-page
  Wise sample as sample-size artifact). Tightened the absolute-URL
  regex to require a host character; defensive try/catch around
  `normalizeAuditUrl`.
- **`normalizeAuditUrl` defensive at the source.** Returns the trimmed
  input on parse failure rather than throwing; a single malformed
  `<link>` no longer aborts the entire audit.
- **`BackpressureMonitor` thresholds raised.** `2× → 4×` baseline,
  `3000ms → 8000ms` p95. The original gate aborted real production-CDN
  audits on normal load variance; the new gate still catches genuine
  origin degradation (Numbeo at p95=30s, Airbyte at 6.7×).
- **`links/unreachable-from-root` skips on partial-sample audits.** The
  rule cannot distinguish real graph isolation from "we only fetched a
  slice of the site"; now suppressed when `sampleSize < total`.
- **Corpus-aware `spam/publication-velocity`.** New option
  `publicationVelocityMaxPerDayCorpusFraction` (default `0.10`).
  Effective threshold = `max(publicationVelocityMaxPerDay,
  ceil(corpusSize * fraction))`.
- **`CORE_RULESET_VERSION`** bumped 1 → 12.

### Trade-offs (read this)

The calibration-driven changes shifted the engine's baseline toward
**lower false-positive rates on reputable catalog/template-driven
sites** at the cost of **slightly higher false-negative rates on
borderline-quality sites that classify as `unclear`** (i.e. sites the
classifier can't confidently place at ≥70% confidence).

Concrete data from the existing dogfood corpus
(`scripts/dogfood-v043.ts`) measured against the same engine version:

- **Reputable pSEO sites** (Zapier, G2, Wise, Typeform, Ramp, Webflow,
  Jasper, Airbyte, Segment): pass rate 33% → 78%; 5 sites now score
  `ready` that scored `concerning` or worse before. Verdicts
  reproducible across runs at the same `sampleSeed`.
- **Reputable non-pSEO sites** (nextjs, react.dev, stripe, linear,
  supabase, posthog, allbirds, gymshark, blog.cloudflare): 10/11 still
  score `ready` as predicted. One regression (nextjs.org → caution at
  risk=30 due to legitimate cross-domain canonical findings).
- **Borderline-quality programmatic directories** (wordpress.com,
  expatistan): both predicted `caution`, both now score `ready`.
  These are the false negatives the trade-off introduces.
  - `wordpress.com` is a polished marketing site; the `ready` verdict
    is arguably correct now and the old `caution` was over-strict.
  - `expatistan` scored `ready` on a 3-page sample, which is
    fundamentally too small for most rules to fire: sample-size
    artifact more than calibration shift.

We treat this trade-off as defensible because:
1. The primary failure mode of v0.5.1 was false-positives on real
   working pSEO sites, which destroyed credibility with the audience
   that actually uses the tool.
2. The two new false negatives are at the verdict-ladder boundary;
   neither is being told "you're great" while genuinely being a spam
   farm. Both still surface real findings; the verdict is one rung off.
3. The reputable-pSEO calibration corpus is locked in as a soft
   regression gate: future calibration changes that move reputable
   sites *down* will fail tests.
4. The existing dogfood corpus (with weak programmatic directories)
   continues to be tracked. Future work: add explicit "low-quality
   pSEO" targets so we can calibrate from both sides simultaneously.

### Known limitation: domain authority is a blind spot

pseolint reads static content + the link graph it can see. It does
NOT measure backlinks, brand mentions, domain age, named editorial
leadership, or any external trust signal. There is no
Moz/Ahrefs/Semrush integration; the engine is meant to be runnable
offline against a build directory.

The reputable-pSEO calibration corpus is biased toward high-authority
domains by selection (Zapier, G2, Wise, etc.). This means the engine
is calibrated to be lenient on shapes that *high-DA* sites ship
successfully, but that leniency mechanically applies to *any* site
running the same shape, including low-DA operators who Google would
treat very differently. **A `ready` verdict on a 6-month-old startup
running Zapier-shaped integration pages is not the same guarantee as
`ready` on Zapier itself.** The engine cannot tell them apart.

Operators at lower authority tiers should treat the verdict as a
*directional minimum*, not a literal ceiling. Authority-aware verdict
adjustment (`AuditOptions.authorityScore`) is on the v0.5.3 roadmap.
See `/methodology` for the full discussion.

### Documentation

- Spec: `docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md`
  (full iteration story across 9 rounds with per-round before/after
  data).

## 0.5.1: 2026-05-03

### Added

- **`links/host-section-divergence` rule.** Detects site-reputation-abuse-shaped sections (the May 2024 spam-policy target). Groups pages by first path segment, evaluates each minority section vs. the rest of the host on four signals: cross-section inbound link ratio, top-100 TF-IDF topic Jaccard, structure-signature overlap, and author-coverage delta. Fires `warning` when ≥2 signals trip; escalates to `error` when ≥3 signals trip on a >50-page section. Suppressed for non-pSEO sites via `PSEO_ONLY_RULE_IDS`. ([spec](docs/superpowers/specs/2026-05-03-site-reputation-abuse-detection.md))
- **Corpus-aware `spam/publication-velocity`.** New option `publicationVelocityMaxPerDayCorpusFraction` (default `0.10`). Effective threshold is `max(publicationVelocityMaxPerDay, ceil(corpusSize * fraction))`, so large directories aren't tripped by what is, in fact, a small percentage of their corpus.

### Changed

- `CORE_RULESET_VERSION` bumped to `3` (rule additions + velocity logic change).
- Fix strings on `spam/publication-velocity`, `spam/template-coverage`, and `spam/template-diversity` now reference the March 27, 2026 core update so users see the connection to the most recent enforcement event.

### Documentation

- README rule tables corrected: count is now `41` (was `43`); removed phantom rules (`content/heading-uniqueness`, `links/hub-pages`, `tech/og-completeness`, `cannibal/title-overlap`, `cannibal/keyword-collision`, `aeo/non-replicable-value`); added documented-but-missing rules (`tech/robots-compliance`, `links/unreachable-from-root`, `data/identical-across-pages`); fixed wrong id `data/data-binding` → `data/missing-binding`.

## 0.5.0: 2026-05-01

### Added

- **Change-driven monitoring.** Auto-detected from prior `--state`: second runs decide which URLs to fetch *before* the network round-trip using a deterministic matrix: new URL → fetch, prior fetch ≥ `--age-floor-days` (default 7) → fetch, ruleset version bumped → fetch, prior warning/error finding → fetch (info findings carry forward), sitemap `<lastmod>` newer → fetch, otherwise SKIP. Sites with `<lastmod>` typically see ~95% fewer fetches on steady-state runs.
- **`--mode <monitoring|fresh>`.** Monitoring is the default when prior state exists. `fresh` forces a full re-audit. `--since` retained as a back-compat alias.
- **`--age-floor-days <n>`.** Minimum days since a URL's last fetch before monitoring forces a re-fetch regardless of other signals.
- **End-of-run monitoring summary.** Console emits `Monitoring: X/Y URLs re-scraped (recheck=…, lastmod=…, age=…, new=…), Z carried forward.`

### Changed

- `--exit-on-regression` now operates against monitoring's actually-fetched URL set, not the full corpus.

## 0.4.3: 2026-04-29

### Added

- **Site-type-aware scoring.** Site classifier categorizes the audited corpus (programmatic-directory, blog, ecommerce, docs, small-marketing) and weights rules accordingly. `PSEO_ONLY_RULE_IDS` suppression keeps non-pSEO sites from being penalized for pSEO-specific rules. ([v0.4 spec](docs/superpowers/specs/2026-04-29-pseolint-v0.4-engine-redesign.md))
- **Four-bucket score categorization.** Findings bucket into spam / quality / technical / aeo independent of rule-id prefix, used by the weighted score.

### Removed

- **`cannibal/title-overlap` and `cannibal/keyword-collision`.** Dropped due to high false-positive rates on legitimately similar pages (localized variants, paginated archives). `cannibal/url-pattern` survives.

## 0.3.3: 2026-04-22

### Added

- **`safeMode` preset.** One-knob safety posture for hosts. `safeMode: "saas"` flips `guardSsrf` on, tightens caps, keeps robots honour on. `safeMode: "cli"` keeps local-friendly defaults.
- **`safeFetch(url)`.** SSRF-safe fetch helper for non-audit use cases (link checking, llms.txt validation).
- **`maxCrawlDiscovered` ceiling.** Caps link-discovery fan-out so a misconfigured crawler can't unbounded-grow.
- **`followRedirects: false` option.** Disable automatic redirect following; useful for redirect-chain auditing in isolation.

## 0.3.2: 2026-04-21

### Added

- **SSRF guard.** DNS-validated private-range check on every fetched URL. Blocks integer/hex-IP bypasses. Re-validates after every redirect.
- **Robots honour for our own crawler.** Honoured target `robots.txt` Disallow directives with UA-specific parsing.
- **`AbortSignal` cancellation.** Clean ctrl-C / programmatic cancel from the API surface.
- **Public API additions.** `validateTargetHost`, `SSRFError`, `DnsResolutionError` for embedders.

## 0.3.1: 2026-04-20

### Added

- **Render-mode analytics blocking.** Blocks ~40 analytics hosts (GA, Plausible, PostHog, Mixpanel, Hotjar, Sentry, etc.) by default in `--render` mode. `--analytics`, `--block-host`, and `allow-first-party` flags for fine-tuning.

### Fixed

- Rendered audits previously fired every analytics beacon on every page. Now silent by default.

## 0.3.0: 2026-04-19

### Added

- **AEO rule category.** 8 rules detecting AI Overview / answer-engine invisibility: `aeo/llms-txt`, `aeo/crawler-access` (GPTBot/ClaudeBot/PerplexityBot/Bytespider/Google-Extended/CCBot/Applebot-Extended/ChatGPT-User), `aeo/freshness-signals`, `aeo/faq-coverage`, `aeo/answer-first`, `aeo/citable-facts`, `aeo/content-modularity`, `aeo/summary-bait`.
- **AEO sub-score.** Independent of the SpamBrain Risk Score; new `AEO: AI Overview Readiness` console section.
- **`mode: "diff"`.** Skips corpus-scoped rules so daily re-audits of changed pages don't re-run clustering / link-graph / sitemap checks. (Renamed `mode: "monitoring"` in v0.5.)

### Changed

- Scoring re-weighted to make room for AEO without reducing SpamBrain weight on pSEO-classified sites.

## 0.2.1: 2026-04-18

### Fixed

- **Daily-budget cache-hit double-count.** `todayTriageSpendUsd` now excludes records where `triage.cacheHit === true`. Cache hits don't incur real API spend, so they must not count against `--ai-daily-budget`. Without this fix, re-running the same audit multiple times per day would over-report spend and falsely trip the budget cap.

### Documentation

- Clarified that `--ai-daily-budget` uses **UTC calendar day** for its rollover window. Users in non-UTC timezones see "today" roll over at their local offset from `00:00 UTC`.

## 0.2.0: 2026-04-18

### Added

- **HTTP cache + delta-mode audits.** `--cache [dir]`, `--cache-ttl`, `--state [path]`, `--since`, `--exit-on-regression`. Cached fetches honor `ETag` / `Last-Modified` via 304 revalidation. Delta mode skips URLs whose content hash hasn't changed since the last run. ([caching spec](docs/superpowers/specs/2026-04-17-audit-caching-and-delta-design.md))
- **Stratified sampling.** `--strategy stratified|random`, `--max-per-template`. Samples allocated by sqrt of cluster size per inferred URL template so every template is represented.
- **AI triage.** Opt-in post-processing layer that turns enriched findings into 1–5 ranked root causes. `--ai`, `--ai-provider`, `--ai-model`, `--ai-endpoint`, `--ai-max-tokens`, `--ai-cache-ttl`, `--no-ai-cache`, `--no-ai-suggest`. ([triage spec](docs/superpowers/specs/2026-04-18-ai-triage-and-adapter-design.md))
- **Open provider registry.** Any Vercel AI SDK provider is supported: `anthropic`, `openai`, `google`, `mistral`, `groq`, `xai`, `cohere`, `ollama` (local). Install only the SDK you need; all are optional peer deps.
- **Cost safety.** `--ai-max-cost <usd>` refuses calls that exceed a per-call estimate cap. `--ai-daily-budget <usd>` reads today's successful-triage spend from local telemetry and refuses calls that would exceed a daily ceiling. Pre-flight cost estimate is printed to stderr before every call.
- **Local telemetry.** Opt-in `--telemetry` writes one JSONL record per audit run (counts only: no URLs, no content, no keys). `pseolint stats` aggregates. `pseolint stats-export <path>` copies the file for manual sharing. TTY-gated triage feedback prompt (y/n/skip) plus `--triage-feedback` for CI.
- **Data-source comparison rules.** `dataSource` option verifies rendered pages against expected key-value data. `data/missing-binding` and `data/identical-across-pages` rules flag divergence.
- **MCP server.** `@pseolint/mcp` exposes three tools: `audit_site`, `explain_score`, `check_page_technical`. `PSEOLINT_MCP_SAMPLE_CAP` env var raises the internal sample cap for larger sites.

### Changed

- Retrofit the AI layer to the Vercel AI SDK: replaces the hand-rolled `LlmAdapter`, `AdapterError`, JSON validator, and DI seam. Net: ~700 LOC deleted, structured-output validation handled by `generateObject({ schema })`.
- `AuditOptions.ai.provider` accepts any registered provider string. `AuditSummary.triage` is new.

### Fixed

- Replaced the `discoveryBudget` egress band-aid with the HTTP-cache + 304 revalidation path. Re-running against the same site costs near-zero egress.
- Narrative is now optional in the triage schema so LLM truncation yields partial but usable results.

### Deprecated / Removed

- `LlmAdapter`, `AdapterError`, `createAdapter`, `__setAnthropicClientFactory`. These were internal: no public consumers existed.
- `@anthropic-ai/sdk` is no longer a peer dependency; replaced by `@ai-sdk/anthropic`.

## 0.1.0: initial public release
