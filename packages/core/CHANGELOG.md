# @pseolint/core

## 0.7.2

### Patch Changes

- cc24997: fix(core): schema/consistency no longer false-positives on pages with multiple
  JSON-LD blocks.

  The v0.7.1 per-cluster rewrite compared the UNION of @types across a cluster, so
  a template where every page legitimately emits several blocks (e.g. TechArticle +
  FAQPage + Organization) read as "mixed types" and fired on every cluster (6 FPs
  on pseolint.dev's own audit). Now it compares each page's @type SET signature and
  fires only when pages in the same template cluster genuinely disagree.

- 3c9cb0d: fix(core): v0.7.2 rule-design batch — graded thresholds + presence-quality.

  Follow-up to the v0.7.1 FP-elimination batch, addressing the two deferred root
  causes (C: binary/absolute thresholds, D: presence-not-quality). Verified
  against the 24-fixture calibration corpus: zero new false positives vs the prior
  metrics, and the crawl-size verdict flips are gone.

  C — binary-threshold redesigns:

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

  D — presence-quality (validate the value, not just its presence):

  - schema/required-fields: empty arrays / whitespace / nameless author objects
    count as missing.
  - schema/json-ld-valid: @type accepts string OR all-string array
    (["Article","NewsArticle"] no longer false-positives).
  - tech/og-completeness: whitespace values count as missing; severity graded
    (title/description warning, image-only info).
  - content/eeat-signals: transparency signal reads contentText not raw html;
    about-link must be same-host.

## 0.7.1

### Patch Changes

- d9797e4: content/unique-value now scores originality as a rarity **density** (normalized-IDF
  average over a page's distinct tokens) instead of an absolute count of
  exactly-page-exclusive words. This fixes margin instability (the flagged set no
  longer "shuffles" when content is added) and false positives on large, tightly-
  themed sites — validated against the reputable-pSEO fixtures: doorway/entity-swap
  spam fires at density ~0.09 while reputable corpora (incl. paperforge.dev) clear
  at ≥0.28, with floors `passBelow 0.20` / `errorBelow 0.12` in the gap.

  Config knob renamed: `rules.uniqueValueMinWords: number` →
  `rules.uniqueValueDensity: { passBelow, errorBelow }`. The rule signature is now
  `uniqueValueRule(pages, { passBelow, errorBelow })`. Borderline pages fire `info`
  rather than `error` so a near-miss no longer reads as a ship-blocker.

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

## 0.7.0

### Minor Changes

- ba1c6ca: Add `checkOriginHealth()` — a pre-flight origin probe that runs before an audit crawls.

  `BackpressureMonitor` only protects an origin _during_ a crawl, after dozens of requests have already landed on a struggling server (the paperforge/Neon incident, where each fetch fanned out into uncached DB queries that exhausted the egress quota). `checkOriginHealth()` fires a handful of **concurrent** probes at the entry URL first — concurrent, so it observes the origin the way the real crawl hits it (parallel fan-out), not a rosier one-request-at-a-time picture — and returns an `ok` / `unreachable` / `degraded` verdict.

  - SSRF-safe — every probe and redirect hop is re-validated against private/loopback ranges (overridable `validateHop` for tests).
  - Conservative: a single transient timeout never trips it. `unreachable` requires _every_ probe to fail; `degraded` requires a 5xx majority or sustained latency past the same 8s ceiling `BackpressureMonitor` uses. 4xx is not treated as degradation.
  - Concurrent probes keep the wall-clock cost to ~one request, so wiring it onto a request path doesn't add N× latency.
  - Fail-open: never throws, so a bug in the check can't block a legitimate audit.

  In the hosted app, the public `POST /api/audits` route blocks only `unreachable` origins (nothing to audit), and the `run-audit` worker — which every audit path runs through, including the monitoring cron — pre-flights the origin and drops a `degraded`/`unreachable` one to gentle (low-concurrency) mode instead of finishing off a struggling server.

- v0.7.0 — Calibration & authority foundations

  - **Two-sided calibration harness + score-vs-outcome instrument.** New `calibrationMetrics()` reports how well the risk score tracks real winning/penalized outcomes against a labeled corpus — threshold-free AUC, class-separation gap, per-band empirical penalty rate, and the over-flag / recall-leak confusion-zone sites. A `detectability` corpus field separates the engine's addressable ceiling from structurally-undetectable (off-page) cases.
  - **Corpus-derived entity auto-masking** (`deriveEntityPatterns`): clusters pages by URL template and masks tokens that vary across siblings, lifting policy-violating recall (44% → 56% on the calibration corpus) and fixing the reputable-vs-spam risk inversion.
  - **Domain-authority moderation scaffolding**: a pluggable `AuthorityProvider` (`CompositeAuthorityProvider` max-combine, `OpenPageRankProvider`, `CommonCrawlProvider`) feeds the existing verdict-shift. Fail-safe no-op until an authority source is configured — no behaviour change by default.

## 0.6.6

### Patch Changes

- 44d018f: Sitemap coverage guardrail + axis-aware unique-value guidance (fixes #3, #4)

  **#4 — declared-vs-discovered coverage guardrail.** When a sitemap is found at
  discovery, two independent under-coverage signals now flag the run `truncated`
  with `truncatedKind: "coverage"` (distinct from the backpressure
  `"backpressure"` kind), reusing the existing partial-coverage surface
  (CLI/Action/MCP/web):

  - **(A) unreachable child sitemaps.** `collectUrlsFromSitemap` now reports child
    total/failed counts, so a sitemap **index** whose children 404 / aren't valid
    sitemaps / exceed the depth cap is flagged — the case a URL-count comparison
    can never see, and the original false-negative class.
  - **(B) fetch shortfall.** Far fewer pages were FETCHED than the sitemap
    declares. Compared against pages actually fetched (pre-filter, pre-sample) and
    bounded by every deliberate limit (explicit `--sample-size`, crawl cap,
    declared total) — so noindex / non-HTML pages, intentional sampling, and a
    small crawl cap do **not** false-fire (the two false positives the first cut
    shipped with).

  Adds `AuditSummary.truncatedKind: "backpressure" | "coverage"` (+ JSON schema)
  so consumers and CI can branch on the cause rather than overloading one boolean.

  **#3 — `content/unique-value` guidance.** The fix string is now axis-aware
  (warns that content shared across same-axis sibling pages — boilerplate,
  per-axis data — does NOT count), the message surfaces the shared-vs-unique word
  split, and tokenization strips surrounding punctuation so `"word"` / `"word."`
  count as one token (removing false precision in the surfaced counts).

  Also routed a remaining `splice(0, n, ...big)` spread through the iterative
  `pushAll` helper (same V8 argument-cap class as the earlier crash fix).

- ea4e822: A truncated run can no longer present as a confident clean verdict

  Found by re-running `pseolint https://paperforge.dev` against the live site: the
  backpressure watchdog (correctly) aborts the cold-start origin after ~11 fetches,
  but the 1-page salvage was then run through the normal classify → score → verdict
  pipeline and emerged as `small-marketing` + suppressed pSEO rules + **`READY ✓`**
  — reproducing the original case-study false-negative via the watchdog rather than
  via discovery (which works). Two fixes:

  - **Classification:** when a run is truncated BEFORE classification (a
    backpressure abort salvaged only a fragment), the site type is forced to
    `unclear` (confidence 0, no rule suppression). Classifying a salvaged fragment
    as a confident `small-marketing` site — and suppressing the pSEO rules off it —
    is what produced the false green.
  - **Verdict:** any truncated run's verdict is floored to at least `caution` — it
    can never read `ready`, so the headline matches the partial-coverage banner.

  The watchdog itself is unchanged: it exists to protect exactly this origin (its
  crawl fans out into uncached DB queries), so it should keep aborting — the fix is
  that the salvaged report is now honest about being incomplete.

## 0.6.5

### Patch Changes

- Harden the public JSON output contract. Bump `SCHEMA_VERSION` from
  `2026-04-v0.4` to `2026-06-v0.6` so it reflects the current v0.6 shape
  (`templates[]`, `truncated`/`truncatedReason`) — the constant had drifted and
  was never bumped when those landed. Publish a draft 2020-12 JSON Schema at
  `schemas/audit-summary.schema.json` (now shipped via the package `files`/`exports`)
  and add a schema-contract test that validates the JSON formatter output against
  it so the schema and types can't silently drift. Document the contract in the
  README, including that `issues` is severity-bucketed (`blockers`/`shouldFix`/
  `informational`) rather than a flat array or category-keyed map, that
  `schemaVersion` bumps on every breaking or additive-public output change, and
  that `truncated: true` means counts/verdict are lower bounds for CI gates.
- flush a partial `truncated:true` report on watchdog abort + warn on localhost concurrency override

  When the backpressure watchdog aborted a crawl mid-flight (the real user run at
  `--concurrency 5` against a single-process dev server), the `OriginDegradedError`
  propagated out of `auditSource()` and every downstream phase (dedup, rules,
  enrichment, scoring, report assembly) was skipped — the CLI caught the error,
  printed "aborted — origin looks degraded", and exited 1 with **zero output**.
  Protecting the origin is correct; throwing away everything collected is not.

  `loadPagesFromSource()` now fills a caller-owned salvage sink incrementally, so a
  mid-crawl abort no longer loses the pages already fetched. `auditSource()`
  catches the watchdog abort at the page-loading boundary (and at the next
  abort checkpoint, for fetch implementations that ignore the abort signal),
  recovers the partial page set, runs the rest of the pipeline over it, and
  returns a normal `AuditSummary` with `truncated: true` and `truncatedReason`
  set to the origin-degraded message. A zero-page abort still returns a valid
  truncated summary instead of crashing. External aborts (ctrl-C / parent
  timeout) and `--no-backpressure` are unchanged.

  The CLI now prints a clear `⚠ PARTIAL REPORT` banner to stderr for a truncated
  run, still writes/emits the report (JSON/console/etc.), and exits 1 so CI knows
  coverage was incomplete. It also warns (without changing the value) when a
  localhost/single-origin target is crawled with an explicit `--concurrency`
  greater than the dev preset's 1, suggesting `--concurrency 1`.

- Sitemap-first discovery for homepage/page sources (closer to how Google crawls)

  Previously, auditing a homepage URL only link-crawled — it never read the site's
  declared sitemap, so a programmatic site with thousands of sparsely-linked (or
  build-frozen, under-linked) URLs was under-discovered. Nested `<sitemapindex>`
  files were already followed when a sitemap URL was passed directly, but nothing
  _discovered_ the sitemap from a plain page URL.

  The HTML-source path now does sitemap-first discovery before link-crawling:

  1. reads `Sitemap:` directives from robots.txt (there can be several), and
  2. failing that, probes `/sitemap.xml` then `/sitemap_index.xml`.

  Discovered sitemap URLs are SSRF-validated, same-origin- and robots-Disallow-
  filtered, then fetched first (they're authoritative); the existing link-crawl
  then fills any remaining discovery budget and dedups against them. When no
  sitemap exists this is a no-op and the audit link-crawls exactly as before.

  Hardening: `<sitemapindex>` recursion is now depth-capped (5 levels) in addition
  to the existing `visited` cycle guard, and individual sitemap fetches are capped
  at 50 MB (the sitemaps.org limit) so a hostile/misconfigured sitemap can't eat
  the byte budget. `fetchRobotsMeta` now also returns the parsed `Sitemap:`
  directives.

  Deferred (noted, not in this change): `.xml.gz` sitemaps served as
  `application/gzip` without `Content-Encoding: gzip` (the common gzip case via
  `Content-Encoding` already works through fetch), URL normalization before
  sitemap sampling, and running the change-driven monitoring matrix over
  discovered sitemaps on homepage-sourced audits.

- make cluster/link-graph traversal iterative to fix "Maximum call stack size exceeded" on large sites

  On a large, densely cross-linked site (the 351-page reproduction), report
  generation crashed with `RangeError: Maximum call stack size exceeded` and
  produced zero output. Clusterable rules (`spam/near-duplicate`,
  `spam/entity-swap`, `spam/doorway-pattern`) emit one finding per related pair,
  so a single fully-connected component yields C(N,2) pairwise findings. While
  collapsing a component into one cluster finding, `enrichFindings` computed the
  similarity range with `Math.min(...similarities)` / `Math.max(...similarities)`.
  The spread operator passes every array element as a separate call argument, and
  V8 caps the argument count (~131072) — so a similarity array of hundreds of
  thousands of pairs overflowed the call stack.

  The similarity range is now computed with a single iterative pass, and the
  post-grouping `passthrough.push(...groupedPassthrough)` spread was replaced with
  an element-wise loop for the same reason. Output is unchanged. Added a
  deterministic, synthetic regression test
  (`tests/enrich-findings-large-cluster.test.ts`) that builds a 600-node
  fully-connected near-duplicate component (179,700 pairs) and asserts
  `enrichFindings` no longer throws.

  Follow-up: the same `push(...spread)` overflow existed earlier in the pipeline,
  which the enrichment-only test missed. In `auditSource` the rule-aggregation
  steps spread the per-rule findings into the running list
  (`findings.push(...tag(rule.findings))` and `allFindings.push(...)`) — so a dense
  site overflowed at rule aggregation _before_ enrichment was reached. All such
  spreads in the audit path are now routed through an iterative `pushAll` helper
  (rule aggregation, sitemap-URL and discovered-page accumulation), plus the
  latent `Math.max(...counts.values())` in the site classifier (100k+ distinct
  titles) and the spreads in `stratified-sample` and the AI `fetch-sitemap` tool.
  Added an integration test (`tests/integration/large-corpus-no-overflow.test.ts`)
  that drives the full `auditSource` over a 600-page directory corpus — it first
  asserts the guarded-against spread still overflows on the runtime, then that the
  audit completes. This is the test that caught the second (pre-enrichment) site.

- fix unscoped title selector picking up SVG <title>; add SVG-title diagnostic

  `parseHtmlPage` extracted the page title with an unscoped `$("title")`
  selector, which also matches inline SVG `<title>` elements (e.g. a logo's
  accessibility label). On pages with no `<head><title>` but an SVG logo, the
  SVG label was reported as the page title — the cause of "307 podcast episodes
  all titled Spotify".

  Title extraction is now scoped to `$("head > title")`. The parser records
  `titleSource` (`"head"` or `"none"`) and, when the head title is missing,
  captures the first inline SVG `<title>` text as `svgTitleSample`. The
  `content/title-uniqueness` rule uses these to emit a diagnostic naming the
  SVG-title trap instead of a generic missing-title message.

## 0.6.4

### Patch Changes

- Export `SCORED_CATEGORY_KEYS` — the canonical list of verdict-contributing
  category keys (every `CategoryKey` except the weight-0 `audit` diagnostics
  bucket). Gives downstream consumers (MCP, CLI, web) a single source of truth for
  "the scored categories" instead of each hardcoding `["integrity",
"discoverability", "citation", "data"]`. A `satisfies readonly CategoryKey[]`
  clause keeps it in sync if a key is renamed.

## 0.6.2

### Patch Changes

- **HOTFIX: Wikipedia bloom filter inlined as base64.** Production deployments on Vercel serverless were failing with `ENOENT: no such file or directory, open '/var/task/packages/core/data/wikipedia-trigrams.bin'`. The Vercel bundler doesn't auto-include data files referenced via runtime path resolution. Inlined the 8 KB binary as a base64 string in `algorithms/wikipedia-paraphrase.ts` (10,924 chars in source). Removes filesystem dependency entirely; works in any runtime (Node, Bun, Cloudflare Workers, Vercel serverless, edge). `data/wikipedia-trigrams.bin` removed from npm `files` array. Build script `bun run build-wikipedia-bloom` is preserved — operators regenerating the corpus must also re-inline the base64 string (one-line node command in the file's docstring).
- No behavioral change: same bloom filter, same hash functions, same ~5% FP rate. Tests verify decoded `Uint8Array` matches the original binary.

## 0.6.1

### Patch Changes

- **Closes the v0.6.0 calibration validation gap.** The cutover code path (`siteVerdictFromTemplates` as default verdict source) was unmeasured at v0.6.0 release because all calibration corpus sites classified as `unclear` / `small-marketing` due to the pinned-URL methodology giving the classifier only 25 URLs per site. v0.6.1 fixes this with a caller-supplied URL override.
- **New `AuditOptions.classifierUrls?: ReadonlyArray<string>`**. When provided, the classifier and `detectTemplates` use this list instead of the sitemap-discovered or pinned-URL set. Audit phase still runs against `pinnedUrls` (cost-bounded). Distinct from `pinnedUrls` (audit set) and `force.urls` (monitoring supplement). Use case: calibration fixtures audit a small sample but classify against full sitemap.
- **Engine wire-through** at `auditor.ts:2334`: explicit caller override takes priority over sitemap-derived URLs.
- **Calibration script `--seed-classifier-urls` mode** fetches each corpus site's live sitemap.xml (recursively expanding sitemap-index entries; cap 5000 URLs per site), writes URL list back to corpus JSON's `classifierUrls` field per site.
- **Verification result**: 2 fixture sites now exercise the v0.6 path with real validation:
  - **Jasper** classifies `programmatic-directory@0.78` (was small-marketing), 9 templates detected, v0.6 path executes — verdict shifts caution → **ready** (improvement)
  - **Airbyte** classifies `programmatic-directory@0.9` (was small-marketing), 6 templates detected, v0.6 path executes — verdict shifts caution → **ready** (improvement)
- v0.6 cutover validated: `siteVerdictFromTemplates` produces sensible (and in these cases better-than-legacy) verdicts on real programmatic-directory shapes. Closes task #99 + the validation gap doc at `docs/superpowers/calibration/2026-05-07-v0.6.0-validation-gap.md`.

## 0.6.0

### Minor Changes

- **Audit-as-template cutover (spec §16 v0.6.0 row).** `siteVerdictFromTemplates` is now the default site verdict source when ≥1 template has ≥5% coverage of total discovered URLs (spec §15.1). When no template meets the threshold the engine falls through to the legacy risk-ladder verdict — bit-identical behaviour for single-template sites and `unclear`/`small-marketing` classifications. The `risk` score is unchanged; only the verdict derivation switches.
- **JSON output schema documented as v0.6 stable.** The `templates: Template[]` field on `AuditResult` is now part of the stable public API. The `findings: RuleResult[]` flat list remains for backwards compatibility through v0.6.x; sunset decision deferred to v0.7 per spec §15.4.
- **Web dashboard per-URL findings list demoted to drill-down.** When ≥2 templates are detected, the per-URL `FindingsPanel` is wrapped in a `<details>` element collapsed by default ("Show all N per-URL findings"). Template cards remain the primary surface. Legacy / single-template audits render the expanded findings list unchanged.
- Calibration verified: all 9 fixture-mode sites produce identical verdicts post-cutover because they classify as `unclear` or `small-marketing` and the template activation gate correctly bypasses the new path. Pre-existing 2 failures (segment, numbeo) unchanged.

## 0.5.15

### Patch Changes

- **Fixed HTML fixture corpus + audit-from-disk** for fully deterministic calibration. New `localFixtureDir?: string` field on corpus site entries. New `--snapshot [<filter>]` mode in `scripts/calibration-reputable-pseo.ts` captures HTML for each pinned URL to `packages/core/calibration/fixtures/<host>/`, with `_manifest.json` mapping original URLs to filenames + `sitemap.xml` + `robots.txt`. The engine's existing filesystem-mode in `loadPagesFromSource` extended (~20 LOC) to read `_manifest.json` and present fixture pages with original HTTP URLs restored.
- 8 sites snapshotted: G2, Wise, Typeform, Segment, Jasper, Ramp, Numbeo, Airbyte. 215 HTML files, 61 MB total committed to the repo. Strips `<script>`/`<style>` blocks before save (preserves JSON-LD for schema rules; ~80% size reduction). Fixtures NOT bundled in the npm package — `files` array stays `["dist", "data/wikipedia-trigrams.bin"]`. Repo-only artifact.
- **Byte-identical verification**: two consecutive fixture-mode runs across all 8 sites produce identical verdicts + risks: G2 ready/20, Wise concerning/45, Typeform caution/24, Segment critical/74, Jasper caution/27, Ramp caution/25, Numbeo concerning/60, Airbyte caution/25. Calibration is now fully deterministic — no network, no content drift, no random sampling.
- **Newly-visible Numbeo verdict**: was previously origin-erroring (30s p95). Fixtures reveal it stably scores `concerning/60` against current ceiling `caution`. Pre-existing calibration miss now made visible. Ceiling NOT updated in this release (per spec constraint); a follow-up calibration patch may raise it once the rule fire pattern is reviewed.
- **Stale-fixture failure mode**: missing files referenced in a valid `_manifest.json` propagate as errors (fail-loud — programmer error). Directory without manifest falls through to existing path-based behavior.
- 5 new tests in `tests/integration/audit-fixture-manifest.test.ts`. Pre-existing failures unchanged at 2.
- **Refresh workflow**: `bun run scripts/calibration-reputable-pseo.ts --snapshot` re-captures all sites; `--snapshot wise` re-captures one. Quarterly cadence recommended; per-site refresh on suspected staleness.

## 0.5.14

### Patch Changes

- **Value-add composite extended to 7 signals.** `content/wikipedia-paraphrase` (shipped standalone in v0.5.13) now contributes to the composite as the 7th signal. Each signal now weighted at 1/7 ≈ 14.3% (was 1/6 ≈ 16.7%). Boundary cases at score=0.30 / score=0.50 may shift by ≤2.4 percentage points per signal — below severity-band granularity for most pages.
- **Test math updates**: two existing value-add tests reshaped to reflect the new 7-signal denominator. The "bestfirenze pattern" test now includes a wikipedia-paraphrase finding among its inputs (without it, the pattern lands at exactly score=0.5 boundary and no longer fires); the "freshness=0.5" test adds the same. New behavior documented in test comments.
- The composite continues to fire ONE finding per page when score < 0.5, severity critical < 0.3, otherwise error.

## 0.5.13

### Patch Changes

Combined release: Wise calibration drift fix + Wikipedia n-gram bloom filter (standalone). Both shipped same session post-v0.5.12 stability work.

**Wise calibration drift resolution** (commit `a4b83c1`):

- **Engine bug fix** in `links/unreachable-from-root` rule: previously ran its full unreachable-from-root BFS on pinned-URL audits because `isSampledAudit` was `false` in pinned mode. Pinned URLs ARE structurally a sample (same as random-sampled crawls). Fixed by changing the dispatcher guard to `isSampledAudit || hasPinnedUrlsEarly`. The rule now correctly suppresses on the pinned-URL path, eliminating 22 false-positive findings on Wise's locale-hub URLs.
- **Corpus annotation update**: even after the false positives cleared, Wise stably scored `concerning` (risk=45) due to 8 real blockers — 5 `content/title-uniqueness` errors + 3 `content/meta-uniqueness` errors on locale-hub pages that legitimately share titles. The `blockerFloor` mechanism kicks in at density 0.32 → floor 45. These ARE real signals; raised Wise's `expectedVerdictCeiling` from `caution` → `concerning` with full annotation in the corpus JSON.
- Net: Wise now passes the corpus test at `concerning`. No other site's verdict changed. Test count: pre-existing failures dropped 4 → 2 (Typeform also resolved as side-effect of the BFS fix).

**Wikipedia n-gram standalone signal** (commit `4aedde9`):

- New rule `content/wikipedia-paraphrase` detects Wikipedia-paraphrased content via trigram bloom filter. Fires `warning`/`low` when ≥40% of page trigrams hit the reference corpus.
- Bloom filter: 8 KB binary at `packages/core/data/wikipedia-trigrams.bin`. Parameters: m=65536 bits, k=3 FNV-1a-32 hashes, ~5,032 unique trigrams indexed from a curated 12-article public-domain Wikipedia sample (CC BY-SA 4.0 attributions in `scripts/wikipedia-samples/NOTICE.md`).
- Calibration evidence: verbatim Marie Curie paragraph → rate 0.72 (fires); original pSEO/commercial copy → rate <0.15 (no fire); random commercial English → rate <0.30 (FP rate within spec). Zero new fires across the 8 auditable reputable-pSEO corpus sites.
- New `bun run build-wikipedia-bloom` script regenerates the binary from `scripts/wikipedia-samples/`.
- RULE_IMPACTS: `baseImpact: 10, perInstance: 3, maxImpact: 25` (lowest among content rules — speculative-confidence + warning).
- **Composite integration deferred**: the v0.5.8 `content/value-add` composite still aggregates 6 signals. Extending to 7 (with this new rule) ships as v0.5.14.

**Test count delta combined**: +19 tests across the two streams (2 from B + 17 from C). Pre-existing 4 baseline failures → 2 (one resolved by B's BFS fix; the other 2 are zapier/segment, unchanged).

## 0.5.12

### Patch Changes

- **Pinned URL sampling for stable calibration runs.** New `AuditOptions.pinnedUrls?: ReadonlyArray<string>` — when provided non-empty, the auditor SKIPS sitemap discovery + random sampling and audits ONLY these specific URLs. Distinct from the existing `force.urls` (which supplements the sample); pinnedUrls REPLACES it. Same-origin validation throws on cross-origin URLs (HTTP sources only). Filesystem sources interpret pinnedUrls as relative paths.
- **AuditSummary.auditedUrls** added — sorted list of URLs the engine actually audited. Surfaced for the `--repin` capture flow but useful for any caller that needs to know what got audited (vs what was discovered).
- **Why this matters**: a verification pass on 2026-05-06 found that consecutive calibration runs against the same engine code produced 4/7 different site verdicts. Random page sampling within each site was the dominant variance source. With pinned URLs, two consecutive runs of Numbeo produced **identical verdicts (concerning, 12 pages each)** — proves the methodology fix works.
- **Calibration script** (`scripts/calibration-reputable-pseo.ts`) gets `--repin [<filter>]` mode that runs each site once and writes the discovered sample URLs back to the corpus JSON's new `pinnedUrls` field. Default invocation reads pinnedUrls and audits those exact URLs. Backward compat: sites with empty pinnedUrls fall back to current random sampling.
- **Subtle decision**: pinned URL 404s fail-soft (page is dropped from the audit set, run continues). Same as existing sitemap-discovered 404 behavior. Fail-loud would let one stale URL block the entire run.
- 7 new tests in `tests/integration/audit-pinned-urls.test.ts` covering pinned-mode behavior, same-origin validation, sample-size override, and `force.urls` interaction.

## 0.5.11

### Patch Changes

- **New rule `content/common-phrase-reuse`** detecting overuse of pSEO marketing clichés. 42 phrases inline in 5 categories: location clichés ("in the heart of", "gateway to"), generic pSEO marketing ("discover the best", "trusted by thousands"), aggregator/listing ("top rated", "best of the best"), fake authority ("experts agree", "industry leaders"), filler hedges ("varies depending on", "wide variety of"). Case-insensitive substring match. Fires ONE finding per page when ≥3 distinct phrases match. Severity `warning`, confidence `low`. RULE_IMPACTS: `baseImpact: 12, perInstance: 4, maxImpact: 30`.
- **Value-add composite extended to 6 signals.** `content/value-add` now aggregates: originality (regurgitated-content), freshness, citable facts, E-E-A-T, translation completeness, AND common-phrase reuse. Each signal weighted equally at 1/6 ≈ 16.7% (was 1/5 = 20%). Severity boundaries unchanged (<0.3 critical, <0.5 error, ≥0.5 no finding). Side effect: bestfirenze "severe" pattern shifts critical → error because the 1/6 denominator changes its score from 0.20 to 0.333 — boundary documented in updated tests.
- **Calibration on reputable corpus**: zero new findings. The ≥3 threshold protects legitimate marketing copy that uses 1-2 of these phrases legitimately. No phrases were removed during calibration.
- 13 new tests (10 for the new rule, 3 for the 6-signal composite math). Total: 1024 passing (was 1010), 4 pre-existing baseline failures unchanged.

## 0.5.10

### Patch Changes

- **v0.6 phase 3 — formatters render per-template cards.** New shared module `formatters/template-cards.ts` exports `renderTemplateCardsConsole`, `renderTemplateCardsMarkdown`, `renderTemplateCardsHtml`, plus `shouldRenderTemplateCards` and `TEMPLATE_CARDS_CSS`. Each format-specific formatter (`console.ts`, `markdown.ts`, `html.ts`) calls the helper when `summary.templates.length >= 2 && !options.legacyFlat`. JSON formatter unchanged — `templates` rides through automatically.
- Each card renders: signature (mono/code), grade chip via `gradeOf(risk)`, top-driver one-liner ("8/10 samples fail spam/thin-content"), URL coverage stat, uniformity bar with red/yellow/green tints at 0.4/0.7 thresholds.
- Falls back gracefully on legacy audits: `shouldRenderTemplateCards` returns false when `templates` is `undefined`, `null`, or has fewer than 2 entries — so pre-v0.5.9 audit JSON files re-rendered through these formatters produce the flat list without error or warning.
- 38 new formatter tests: `formatters/template-cards.test.ts` (24) covers per-format rendering edge cases; `formatters/legacy-flat.test.ts` (14) verifies the flag bypass path.

## 0.5.9

### Patch Changes

- **v0.6 reframe phase 1 — template detection + per-template scoring (opt-in).** Audit result gains an additive `templates: Template[]` field populated when site classification is `programmatic-directory` / `ecommerce` / `docs` AND `detectTemplates(urls)` returns ≥2 surviving clusters (≥1% URL coverage, ≥5 URLs each). Each `Template` carries its signature, total URLs, audited URLs, per-template `verdict` / `risk` / `categories`, and a `variance` block with per-rule fire-rates, uniformity score (`1 − mean(stdev(per-rule binary fire pattern across samples))`), and top-driver rule. `findings` flat list is unchanged — phase 1 is purely additive. `RuleResult` gains optional `template?: string` tagging for findings whose `pageUrl` belongs to a detected cluster.
- **`siteVerdictFromTemplates(templates)`** helper exported but NOT yet wired to override the headline verdict — that cutover lands in v0.6.0 per the rollout in `docs/superpowers/specs/2026-05-04-pseolint-v0.6-audit-as-template-reframe.md` §16. Filters to templates with ≥5% coverage, picks the worst verdict.
- **Activation gating**: degenerate sites (`unclear` / `small-marketing` / `blog`) bypass v0.6 detection — the legacy single-template path runs and the v0.5.3-v0.5.8 signal stack catches them. Bestfirenze regression confirms this — its 6 URLs collapse to one template signature, gating fails, legacy path holds.
- **31 new tests** — `template-detection.test.ts` (17) covers cluster filter math, ≥2-template threshold, URL→template lookup, long-tail bucket; `per-template-scoring.test.ts` (14) covers per-template verdict/risk computation, variance metric uniformity, top-driver, site verdict §15.1 logic. Total: 967 passing, 4 pre-existing baseline failures unchanged.

## 0.5.8

### Patch Changes

- **New rule `content/value-add`** — composite that aggregates 5 existing signals into a single 0-1 per-page quality score: originality (1.0 if `content/regurgitated-content` doesn't fire), freshness (`aeo/freshness-signals`), citable facts (`aeo/citable-facts`), E-E-A-T (`content/eeat-signals`), translation completeness (`content/translation-no-op`). Each signal weighted equally. Missing signals treated as 1.0 (best-case) — the rule only penalises _confirmed_ problems, not absence of evidence.
- **Severity bands**: score < 0.3 → critical, 0.3 ≤ score < 0.5 → error, ≥ 0.5 → no finding (no noise on already-clean pages).
- **Architecture**: second-pass design — `valueAddRule(pages, allFindings)` runs after the per-rule loop assembles findings. Doesn't re-parse pages; reads existing finding tags. Same `suppressedRuleSet` / `isRuleEnabled` guards as other rules.
- **Calibration**: bestfirenze regression test confirms the rule fires critical on its degenerate pages. Reputable corpus (G2, Wise, Webflow, Jasper, Ramp) — zero new findings; pre-existing 4 calibration failures unchanged. RULE_IMPACTS: `baseImpact: 25, perInstance: 8, maxImpact: 50`. 13 new tests.

## 0.5.7

### Patch Changes

- **Cheerio refactor for `content/regurgitated-content`** — replaced 4 fragile HTML-structure regexes (`IMG_SRC_RE`, `IFRAME_SRC_RE`, `REVIEW_BLOCK_RE`, `GOOGLE_MAPS_NOOPENER_RE`) with cheerio DOM selectors. Eliminates catastrophic-backtracking risk on adversarial HTML and fixes false-positives where the literal "Powered by Google" text appears inside an attribute value. Behavior on existing fixtures unchanged.
- **Bestfirenze.com regression test** — new calibration test at `tests/calibration/bestfirenze-regression.test.ts` guarding the v0.5.3-v0.5.6 stack end-to-end on a known-degenerate site (6-page directory, 0 unique content per page across `/en` `/fr` `/it` `/de` `/es`). Asserts: classifier guard trips → `unclear`, no severity demotions, `spam/thin-content` fires at native error, `content/translation-no-op` correctly skips (30-word floor), `content/regurgitated-content` fires, risk floors at ≥60, verdict ≥ concerning. +10 assertions.
- **Reputable-corpus sweep documentation** at `docs/superpowers/calibration/2026-05-04-v0.5.7-sweep.md` — zero verdict drift on currently-passing reputable sites (G2, Wise, Webflow, Jasper, Ramp); new translation-no-op + regurgitated-content rules don't fire on any reputable site (no false-positive exposure on current corpus); blocker density floor adds ≤1 point to Wise (0.16 ratio). Two threshold tweaks recommended for future review (not applied): `content/title-uniqueness` demotion in `unclear`/`programmatic-directory` profiles; per-profile severity for `content/translation-no-op` on `programmatic-directory` (multilingual catalogs).

## 0.5.6

### Patch Changes

- Version bump to align with CLI 0.5.6 (CLI inline upload). Engine surface unchanged.

## 0.5.5

### Patch Changes

- **Stratified URL sampling across templates** in `planScrapeStrategy`. When the candidate URL list exceeds budget by 1.5× AND clustering produces ≥2 templates with no single template dominating >80%, sample slots are allocated proportionally across template clusters (with a `min(20, 10% × budget)` long-tail bucket so singleton paths like `/about` aren't starved). Watched URLs (force-refetch) bypass the budget entirely. On a 100k-URL site with one giant `/listing/:slug` cluster (90k pages) and smaller `/category/:slug` (8k) and `/help/:slug` (2k) clusters, the audit now covers all three rather than 200 slots from the dominant cluster. 9 new unit tests in `tests/scrape-strategy.test.ts`.
- **New rule `content/regurgitated-content`** detecting Google Places API regurgitation patterns (the bestfirenze.com value-add gap). Heuristic-only, fires at `warning` severity when ≥2 of 5 signals are present per page: (1) "Powered by Google" attribution, (2) ≥60% Google-hosted images (`googleusercontent.com`, `lh3.googleusercontent.com`, `maps.googleapis.com/maps/api/place/photo`, `streetviewpixels-pa.googleapis.com`), (3) Google Static Maps embeds or Maps iframes, (4) Places API JS markers (`PlacesService`, `AutocompleteService`), (5) ≥5 review-style blocks with star ratings + paragraphs but no E-E-A-T author signal. RULE_IMPACTS: `baseImpact: 15, perInstance: 5, maxImpact: 35`. 9 new tests. v0.6 will add Wikipedia/Tripadvisor n-gram overlap with external corpus checks.

## 0.5.4

### Patch Changes

- New rule `content/translation-no-op` for cross-language identical-content detection. When sibling pages share locale-path differences (e.g. `/en` `/fr` `/it` `/de` `/es` of the same template) but body content is ≥95% similar, fire as `error` severity with category `content` (bucket `integrity`). Catches the bestfirenze.com pattern at the rule level, complementing the v0.5.3 classifier degeneration guard. RULE_IMPACTS: `baseImpact: 30, perInstance: 10, maxImpact: 60`. 8 new unit tests covering positive (5 identical locale variants → 1 finding), negative (translated content with similarity < 0.95 → no finding), edge cases (single variant, non-locale-prefixed siblings, root template collapse).

## 0.5.3

### Patch Changes

- Add `force.urls` audit option (and `forceRefetchUrls` on `planScrapeStrategy`) — caller-curated "watched pages" list that always refetches, short-circuiting the monitoring matrix with a new `RefetchReason` of `"watched"`. Watched URLs absent from the sitemap are still audited.

- Grading rethink: classifier degeneration guard, blocker density floor, verdict/grade alignment.

  Self-audit on bestfirenze.com (a 6-page tourism directory with 0 unique content per page across `/en` `/fr` `/it` `/de` `/es` locale variants) returned grade B / risk 37 / verdict "caution" — verdict and grade disagreeing because the classifier labelled the corpus as `small-marketing`, which then demoted `spam/thin-content`, `aeo/citable-facts`, `spam/doorway-pattern` to `info`. Three calibration fixes:

  - **Classifier degeneration guard** (`site-classifier.ts`): new `applyDegenerationGuard` + `corpusStatsFromPages` exports. After `classifySite` returns `small-marketing` or `blog`, the guard inspects parsed-page stats — if median word count < 50 OR ≥50% of pages share an identical title (with ≥4 pages), the classification is downgraded to `unclear` with a `degeneration-guard-tripped` signal. `profileFor()` recognises the signal and returns a no-overrides scoring profile so natural rule severities fire.
  - **Blocker density floor** (`scoreFromFindings`): now takes `pageCount` and floors risk by `blockers / pageCount` density. Bands at ≥0.15 / ≥0.3 / ≥0.5 floor at 25 / 45 / 60. Reputable directories sit at <0.05 and are unaffected; bestfirenze (5/6 = 0.83) floors at 60.
  - **Verdict/grade alignment** in dashboard layer (`@pseolint/web` 0.0.7): band labels now align with the engine's verdict ladder so a "B / caution" visual mismatch is impossible.

  Net effect on bestfirenze.com: classification `small-marketing` → `unclear`, severity demotions removed, blocker count climbs, density floor applies — risk lands ≥60 (D / critical) with verdict and grade reading the same vocabulary.

## 0.5.0

### Minor Changes

- v0.5.0 (continued) — AI orchestrator: 25 tools, fix-manifest output, validators + diffs

  Net-new public API: `orchestrate(opts)` — drives an LLM through 25
  deterministic tools (sitemap fetch, template clustering, per-page rule
  checks, AEO probes against live Anthropic/Perplexity/Gemini, SerpAPI)
  and produces a **fix manifest** of concrete patches (`replace_h1`,
  `rewrite_meta`, `add_jsonld`, `add_faq_block`, `rewrite_intro`,
  `add_internal_link`, `remove_thin_block`, plus domain-level
  `robots_txt`/`sitemap_xml`/`canonical_strategy`).

  **Architecture**: rules become tools the LLM calls; the LLM picks order;
  budget caps (LLM tokens + external probe USD, pre-flight + reactive
  enforcement) bound spend. Watchdog injects a convergence reminder every
  N tool calls. Page cache by reference (HTML never travels in
  conversation history) keeps token cost bounded as audits scale.

  **Manifest validation** (Phase 4): 11 deterministic patch validators
  (Schema.org required-properties, robots.txt structure, sitemap XML,
  cheerio HTML safety with allowlisted tags, etc.) run on every
  LLM-proposed patch. Failed patches are dropped from the manifest and
  surfaced in `validation.failures` with structured location info — the
  LLM never gets the chance to ship a malformed JSON-LD block or an
  unsafe `<iframe>` to a user.

  **Structured diffs** (`diffManifest`): every patch maps to one of 5
  `PatchDiff` kinds (text_replace, html_insert, html_remove, file_replace,
  guidance) suitable for direct UI rendering with HTML-escaped attributes.

  **External probe tooling**: `query_serp` (SerpAPI, $0.005/call),
  `ask_ai_engine` (Anthropic / Perplexity Sonar / Gemini citation
  probes), `validate_jsonld`, `check_robots`, `check_indexability`,
  `check_domain_llms_txt`, `check_domain_crawler_access`. All
  cost-tracked.

  Public exports: `orchestrate`, `runOrchestrator`, `orchestratorTools`,
  `defineTool`, `validateManifest`, `diffManifest`, `manifestSchema`,
  `buildSystemPrompt`, `DEFAULT_BUDGET`, plus types `FixManifest`,
  `BudgetCaps`, `UsageSnapshot`, `StopReason`, `SessionEvent`,
  `SessionResult`, `PatchDiff`, `ManifestDiff`,
  `ManifestValidationReport`. AbortSignal threading through every I/O
  tool. AsyncLocalStorage-backed page cache.

  Verified end-to-end across 4 dogfood runs against pseolint.dev (final
  run: 36 tool calls, $0.55, 4 minutes wall, completed manifest with 5/6
  patches passing validators — one rejected meta-description for being
  167 > 160 chars).

### Minor Changes

- v0.5.0 — Change-driven monitoring

  **Why:** Monitoring runs on a 4k-page site re-fetched everything. Rule
  evaluation is microseconds; the fetch is seconds. The pre-v0.5 `--since`
  flag did change-detection at the wrong layer — it post-filtered findings
  on already-fetched pages, paying the network cost on every URL just to
  skip a few microseconds of CPU. v0.5 moves the decision upstream of the
  fetch so unchanged URLs are never network-touched.

  **Architecture:** New `planScrapeStrategy()` pure module evaluates each
  candidate URL against a 7-reason decision matrix BEFORE fetching: new,
  age floor (default 7d), ruleset version mismatch, open findings recheck,
  sitemap `<lastmod>` newer than prior fetch, GSC delta (Pro), or no skip
  evidence. URLs that match a refetch reason are fetched as today; URLs
  that match `unchanged` are skipped entirely and their findings are
  carried forward from prior state with `carriedForward: true` and
  `lastVerifiedAt` markers.

  Expected savings depend strongly on sitemap hygiene:

  - **Sites with `<lastmod>` in sitemap.xml** (Next.js, WordPress/Yoast,
    Astro): up to ~95% fetch reduction on steady-state monitoring runs
    once the prior state has aged past the recheck-trigger findings.
  - **Sites without `<lastmod>`** (custom-rolled sitemaps, older CMSes):
    every URL hits the `no-signal` reason and gets refetched. v0.5
    monitoring helps via faster cache revalidation but doesn't skip the
    round-trip. A future HEAD-fallback path (deferred) will close this gap.

  Severity gate on the `recheck` reason: only `error`, `critical`, and
  `warning` findings trigger a per-run recheck. `info` findings carry
  forward without re-fetching the page. Without the gate, any URL with
  any finding would refetch and the carry-forward path would be dead code.

  **Breaking:**

  - **State schema bumped to v2.** Existing `.pseolint/state.json` files
    from v0.4.x are discarded with a warning on first read; users get one
    full baseline audit, then incremental monitoring kicks in.
  - **Auto-monitoring is the new default** when a prior state file
    exists. Pre-v0.5 required `--since` to opt in. Use `--mode=fresh` to
    force a full re-audit even with prior state present.

  **Added:**

  - `planScrapeStrategy()` exported from `@pseolint/core` — pure decision
    matrix; testable without I/O.
  - `CORE_RULESET_VERSION` constant. Bump when adding rules or materially
    changing rule logic so monitoring runs re-evaluate previously-skipped
    URLs against the new ruleset.
  - `AuditSummary.scrapePlan` reports `fetched` / `carriedForward` counts,
    per-reason breakdown, ruleset version, and last full audit timestamp.
  - `RuleResult.carriedForward` and `RuleResult.lastVerifiedAt` mark
    findings carried over from a prior run for staleness reasoning.
  - `UrlStateEntry.findings` now persists full RuleResult records (not
    just IDs) so future runs can carry them forward.
  - `parseSitemapUrlsWithLastmod()` exported — sitemap walker now surfaces
    `<lastmod>` alongside URLs.
  - CLI: `--mode=monitoring|fresh` and `--age-floor-days=N`.

  **Changed:**

  - `--since` is now an alias for `--mode=monitoring` (kept for
    back-compat). Behavior is unchanged for users who passed it explicitly.
  - `collectUrlsFromSitemap` returns `{ urls, lastmodByUrl }` instead of
    `string[]`. Internal API; no external consumers.
  - `RunState` adds required `rulesetVersion` and `lastFullAuditAt`.

  See spec: `docs/superpowers/specs/2026-05-01-change-driven-monitoring-design.md`.

## 0.4.3

### Patch Changes

- v0.4.3 — classification-driven scoring, fixes credibility crisis

  Trigger: an external reviewer ran pseolint on his own site and didn't
  believe the verdict. Three-site dogfood (nextjs.org, wordpress.com,
  shopify.com) confirmed the issue — nextjs.org would score `concerning`
  (60) on a meaningful sample, with 7 of 11 actionable findings being
  AEO-style "your marketing page doesn't read like a fact database."
  Citation category alone drove 25 risk points just from the AEO bucket
  maxing out.

  This release rewires scoring so the verdict is **classification-aware**:
  a docs site is judged by what matters for docs sites; a programmatic
  directory is judged by what matters for pSEO; a marketing site isn't
  penalized for being marketing-shaped.

  **Changes:**

  - New `SCORING_PROFILES` map keyed on `SiteType`. Each profile defines
    per-category weights + severity overrides + confidence overrides.
    Applied when classifier confidence ≥ 0.7; below that, conservative
    `unclear` defaults.
  - New `RULE_IMPACTS` map gives every rule its own
    `baseImpact + perInstance × maxImpact` curve, replacing the global
    4-tier `SEVERITY_WEIGHTS`. Spam findings amplify with cluster size;
    AEO findings stay capped low.
  - New `Confidence` type (`high | medium | low | speculative`) on
    `RuleResult`. Per-rule emit logic on 10 rules. Low-confidence
    findings carry a caveat in the message and contribute proportionally
    less to scoring.
  - New site classifier types: `docs` (Docusaurus / Nextra / GitBook
    / VuePress shape) and improved `ecommerce` (Shopify / WooCommerce
    shape). Plus a `tryClassifyLocalizedMarketing()` detector that
    prevents stripe.com / vercel.com / linear.app from being misclassified
    as `programmatic-directory` because of `/[lang]/` URL prefixes.
  - Re-tuned tech rule impacts: `tech/hreflang-consistency` is now a
    single base-impact finding regardless of how many language pairs
    break (one declaration breaks them all — count shouldn't compound).
    `tech/canonical-consistency` lowered to base 8, perInstance 1.
  - Formatters surface "Audited as &lt;type&gt; (NN% confidence)." prominently.
    Confidence caveats render after low-/speculative-confidence findings.
  - Marketing copy on /, /tools, /rules, /symptoms, /limits clarifies
    scope: "pseolint audits programmatic-SEO + AI Overview readiness.
    Not a general SEO audit — for Core Web Vitals and broken links use
    Sitebulb, Screaming Frog, or Ahrefs."

  **Dogfood results (post-change):**

  ```
  nextjs.org      ready (14)   → ready (15)   no regression
  react.dev       caution (23) → ready (15)   improved
  stripe.com      [aborted]    → ready (9)    correctly classifies localized
  wordpress.com   caution (24) → ready (12)   improved
  shopify.com     concerning(58)→ caution(28) -30 risk; remaining findings real
  ```

  Tests: 663/663 pass (was 646 in v0.4.2 — +17 new tests for classifier
  types, scoring profiles, confidence emission, formatter output).

  **Reasoning trail:** see
  `docs/superpowers/specs/2026-04-30-pseolint-scoring-credibility.md`
  for the full diagnosis + design rationale.

## 0.4.2

### Patch Changes

- v0.4.2 — page-skip extensions, framework-aware web defaults, template bucketing, fixplan artifact

  **@pseolint/core (0.4.1 → 0.4.2)**

  Three new page-skip filters extending the v0.4.1 noindex / auth machinery:

  - `skipBoilerplate?: boolean` (default `false`) — skip cookie / legal /
    consent / imprint pages via title, H1, or URL pathname matching
    well-known compliance-page patterns (`/privacy`, `/terms`, `/cookies`,
    `/gdpr`, `/ccpa`, `/impressum`, `/disclaimer`, `/accessibility`,
    `/do-not-sell`, etc.). Single-signal trigger because patterns are
    anchored — a marketing page that mentions "privacy" in its body won't
    fire. New `detectBoilerplatePage(page)` exported from `./page-filter.js`.
  - `skipSearchPages?: boolean` (default `false`) — skip pages with
    search-result URL hallmarks: query parameter `q` / `query` / `search` /
    `s` / `keyword`, or pathname starting with `/search`. Per Google's own
    guidance these should be `noindex`'d but many sites don't tag them.
  - `skipEmptyBody?: boolean` (default `false`) — skip un-hydrated SPA
    shells: body text < 100 chars, script tags present, no substantive
    `<noscript>` fallback. The right fix is `--render`, not content rules.

  `pageSkipReason()` now returns `"noindex" | "auth-detected" |
"boilerplate" | "search-result" | "spa-shell" | null` in priority order.
  The `audit/skipped-by-policy` diagnostic surfaces all five reason
  categories with per-reason counts.

  Plus a refactor for output ergonomics:

  - New `bucketByTemplate(findings)` helper at `./formatters/bucket-findings.js`.
    Console + markdown formatters now collapse findings sharing a template
    signature into one line (`× 23 instances on /templates/[state]-llc-fees
template — fix once, resolve all 23.`). Single-instance findings keep
    the legacy format. Site-wide / non-template buckets render as
    `× 2 affected pages`.
  - New `formatFixplan(summary)` formatter at `./formatters/fixplan.js`.
    Emits a markdown checklist of fixes ordered by effort (quick wins →
    moderate → structural → other), each item bucketed by template, with a
    Skipped section breaking down noindex / auth-detected counts and a
    footer wallclock estimate. Designed for paste-into-GitHub-issue use.

  **pseolint CLI (0.4.1 → 0.4.2)**

  - New flags: `--skip-boilerplate`, `--skip-search-pages`,
    `--skip-empty-body` mirror the corresponding `AuditOptions`. All
    off-by-default to preserve CLI back-compat.

  **@pseolint/mcp (0.4.1 → 0.4.2)**

  - Workspace dep bump to pick up the new `AuditOptions` fields. No tool
    surface changes; callers can pass the new flags via the MCP audit
    tool's options if they want them.

  **Web app (0.0.4 → 0.0.5)**

  The hosted form audit pipeline now adapts to the audited site's framework:

  - New `FRAMEWORK_IGNORE_PATTERNS` map keyed on `nextjs | wordpress |
shopify | webflow | astro | nuxt | remix`. Each framework's
    idiomatic-but-non-marketing routes (e.g. WordPress `/wp-includes/`,
    Shopify `/cart`, Next `/_next/data/`, etc.) layer additively on top
    of the base `WEB_AUDIT_DEFAULT_IGNORE`.
  - New `detectFrameworkFromUrl(url, signal?)` helper does a single
    preflight HEAD/GET of the source root, checks `x-powered-by`,
    `x-vercel-id`, `x-shopify-*` response headers + script-src body
    signatures, and returns the framework key. Wrapped in an
    `AbortController` with a hard 5s timeout so a slow root doesn't
    block the audit.
  - `run-audit.ts` runs framework detection in its own Inngest step
    (`detect-framework`) before the audit step. Failure / timeout falls
    through to `resolveAuditIgnorePatterns(undefined)` (base list only).

  Tests: 646/646 pass. core + cli + mcp + action all build clean.

## 0.4.1

### Patch Changes

- v0.4.1 — config UX fixes + page-skip policy

  **@pseolint/core (0.4.0 → 0.4.1)**

  - New `respectNoindex?: boolean` (default `true`) — pages explicitly marked
    `noindex` (via `<meta name="robots">` or `X-Robots-Tag` header) are
    excluded from rule evaluation. The site owner already opted out of SEO
    indexing for them; auditing produces noise the reader can't act on. The
    two noindex-conflict rules (`tech/canonical-noindex-conflict`,
    `tech/robots-noindex-conflict`) and `tech/hreflang-consistency` still
    receive noindex'd pages so they can flag accidental noindex'ing /
    inconsistent hreflang declarations.
  - New `skipDetectedAuth?: boolean` (default `false`) — heuristic detection
    of login / signup / password-reset / verify-email pages via password-input
    density, page title pattern (brand-suffix-stripped), and H1 pattern.
    Requires 2+ signals for a positive verdict, keeping false-positives low
    on marketing pages with single-signal characteristics.
  - New `audit/skipped-by-policy` diagnostic surfaces every URL skipped by the
    above policies in `summary.diagnostics.auditFindings` — the
    accidentally-noindex'd page now shows up as a visible skip line instead of
    being absent without explanation.
  - New `warnUnmatchedIgnore?: boolean` (default `false`) — per-pattern warning
    for unmatched `--ignore` patterns is now opt-in. The CLI sets it to true
    only when `--ignore` came from the command line. Config-loaded patterns
    (e.g. `pseolint.config.ts` with broad safety patterns like `**/api/**`)
    no longer spam warnings when the patterns legitimately don't match a
    small site's surface. A consolidated `none of the N ignore patterns
matched any URLs — check config or --ignore for typos` warning still
    fires when ALL patterns miss, regardless of source.
  - New helpers exported from the entry point: `detectNoindex`,
    `detectAuthPage`, `pageSkipReason` from `./page-filter.js`.

  **pseolint CLI (0.4.0 → 0.4.1)**

  - `pseolint.config.ts` files are now auto-loaded via cosmiconfig (jiti
    loader). Previously only `.js` / `.cjs` / `.mjs` / `.json` configs were
    picked up; `.ts` files silently fell through, forcing users to inline
    `--ignore` patterns. Both `pseolint.config.ts` and `.mts` variants are
    now in the searchPlaces list.
  - New flag `--no-respect-noindex` — audit pages marked noindex anyway
    (useful when investigating an accidentally-noindex'd page).
  - New flag `--skip-detected-auth` — opt into the heuristic auth-page skip.

  **@pseolint/mcp (0.4.0 → 0.4.1)**

  - Picks up the core changes via the workspace dep bump. No tool surface
    changes; auth-page detection / noindex respect are now available to
    callers that pass the relevant `AuditOptions` fields.

  **Web app**

  Public-form audits run through `apps/web/src/inngest/functions/run-audit.ts`
  now apply opinionated defaults: a `WEB_AUDIT_DEFAULT_IGNORE` URL pattern
  list (framework metadata + auth + admin + API + WordPress conventions) plus
  `respectNoindex: true` and `skipDetectedAuth: true`. End users running
  audits via the public form no longer see noise from utility routes.

  Tests: 604 / 604 pass. Engine + CLI + MCP + action all typecheck clean.

## 0.4.0

### Minor Changes

- v0.4.0 — engine redesign

  Breaking-change release coordinated across all three packages.

  **@pseolint/core (0.3.3 → 0.4.0)**

  - Replaced numeric `score` (0–100, lower = better) with the verdict ladder
    `ready` (≤20) | `caution` (≤40) | `concerning` (≤60) | `critical` (>60).
    The numeric value is still emitted as `risk` for sorting and CI gating.
  - Consolidated 8 source-tree categories into 4 scoring super-categories:
    `integrity` (spam + content + cannibal, weight 0.50), `discoverability`
    (links + tech, 0.20), `citation` (aeo + schema, 0.25), `data` (0.05).
  - Dropped 8 noisy rules (cannibal/title-overlap, cannibal/keyword-collision,
    content/heading-uniqueness, links/hub-pages, plus four others). Total
    rule count is now 32.
  - New `AuditSummary` shape: `schemaVersion: "2026-04-v0.4"`, `verdict`,
    `risk`, `headline`, `categories[].grade/issues`, `issues.{blockers,
shouldFix, informational}`, `diagnostics.{originReadiness, crawlStats,
auditFindings}`, `siteClassification`.
  - New `siteClassification` field (§4.11): pre-flight URL-pattern + sitemap - framework heuristics infer `small-marketing | blog | programmatic-
directory | unknown` and suppress pSEO-only rules
    (`spam/template-coverage`, `spam/template-diversity`,
    `spam/entity-swap`, `cannibal/url-pattern`) on small sites unless the
    caller passes `strict: true`.
  - New `AuditOptions.strict` flag to bypass classification-driven rule
    suppression.

  **pseolint CLI (0.3.2 → 0.4.0)**

  - New flags: `--ci-threshold <severity>` (replaces numeric `--threshold`
    for CI gating), `--explain` (full bucketed finding view), `--strict`
    (bypass pSEO-only rule suppression).
  - `--threshold` deprecated with a runtime warning — still functional for
    one minor.
  - New `pseolint diff <baseline> <current>` subcommand: verdict-rank
    deltas + fixed/regressed/new findings between two AuditSummary JSON
    reports. Tolerates mixed v0.3 / v0.4 JSON.
  - Console formatter rewritten around the verdict ladder. JSON, HTML, and
    Markdown formatters all consume the new shape.
  - `--watch` flag reserved (planned for v0.4.1, not implemented).

  **@pseolint/mcp (0.3.1 → 0.4.0)**

  - All three tools (`audit_site`, `explain_score`, `check_page_technical`)
    migrated to the v0.4 `AuditSummary` shape: `summary.score` →
    `summary.risk`, `summary.findings` → flattened from `issues.*`,
    `summary.categoryScores` → `summary.categories`.
  - `explain_score` now surfaces `siteClassification` (type, confidence,
    suppressed-rule count) when present.
  - `CROSS_PAGE_RULES` set updated to remove the 4 dropped cross-page rules.

  **Migration**

  Pre-existing v0.3 JSON reports remain readable — `/r/[slug]` and
  `/r/compare` in the web app detect `summary.schemaVersion` and route
  through legacy renderers. New CI gates should switch from
  `--threshold 40` (numeric) to `--ci-threshold concerning` (semantic).

  Spec: `docs/superpowers/specs/2026-04-29-pseolint-v0.4-engine-redesign.md`.

## 0.3.3

### Patch Changes

- v0.3.3: safeMode preset, CLI safety flags, MCP safe-by-default

  Consolidates the safety work from render-analytics blocking (v0.3.1),
  SSRF / AbortSignal / robots-honor (v0.3.2), and the safeMode preset
  (v0.3.3) for the CLI and MCP packages, which skipped the prior
  intermediate releases on npm.

  ## @pseolint/core → 0.3.3

  Incremental over 0.3.2 (which shipped SSRF guard, AbortSignal support,
  and robots.txt honour for our own crawler):

  - `safeMode: "saas" | "cli"` preset on `AuditOptions` — flips
    `guardSsrf`, `respectRobotsTxt`, `followRedirects`, `maxCrawlDiscovered`,
    and `maxFetchBytes` defaults in one knob. Individual option overrides
    still win.
  - `safeFetch(url, options?)` — SSRF-safe fetch for non-audit use cases
    (webhook URL verification, favicon lookups, etc.). Wraps `cachedFetch`
    with `validateTargetHost` baked in.
  - `maxCrawlDiscovered` — hard ceiling on link-discovery fan-out so a
    malicious site with many self-links can't extend crawl up to the byte
    budget. Default 5000 (2000 under `safeMode: "saas"`).
  - `followRedirects: false` option — returns 3xx as-is so security-
    sensitive audits can report redirects without following them.

  New exports: `safeFetch`, `SafeMode` type.

  ## pseolint (CLI) → 0.3.1

  First CLI release since 0.3.0; bundles the v0.3.1 / v0.3.2 / v0.3.3
  CLI-facing work:

  - Render-mode analytics blocking flags: `--analytics <block|allow|allow-first-party>`,
    `--block-host <host>` (repeatable). Prevents rendered audits from
    firing GA / Plausible / PostHog / Mixpanel / Hotjar / Sentry beacons
    on every page.
  - `--safe-mode <saas|cli>` — applies the core preset.
  - `--no-respect-robots` — audit sitemap URLs even when the target's
    robots.txt Disallow's them (use for your own staging sites).
  - `--no-follow-redirects` — report 3xx as-is.
  - `ctrl-C` handler — SIGINT triggers a clean abort via `AbortController`;
    in-flight fetches cancel cleanly instead of the process being hard-
    killed mid-read. Second `ctrl-C` within ~1 s forces exit.
  - `pseolint.config.ts` schema extended for `safeMode`, `respectRobotsTxt`,
    `followRedirects`, `guardSsrf`, `maxCrawlDiscovered`.

  ## @pseolint/mcp → 0.3.1

  First MCP release since 0.3.0; picks up all of v0.3.1 / v0.3.2 / v0.3.3
  via the core update, plus one meaningful default flip:

  - All three tool handlers (`audit_site`, `explain_score`,
    `check_page_technical`) now default `safeMode: "saas"`. AI assistants
    running in end-user environments can't be tricked into scanning cloud
    metadata / localhost / RFC1918 networks via a malicious URL argument.
    `guardSsrf`, `respectRobotsTxt`, tighter caps all flip on.

  ## Not changed

  `@pseolint/action` — runs in GitHub-public-network runners, auto-
  propagates new core features through its existing `AuditSummary`
  rendering. No separate bump.

  ## Test state

  528 / 528 tests pass. Typecheck clean across core / cli / mcp / action.

## 0.3.0

### Minor Changes

- 01627a8: feat: add AEO rule category with 8 rules for AI Overview readiness

  Introduces `aeo/*` — a new scored rule category focused on Answer Engine
  Optimization. Brings the total to **42 rules across 8 categories** (7 scored

  - `data/*`). While SpamBrain rules protect against Google penalties, AEO
    rules audit whether pSEO pages are structured to be cited in AI Overviews
    (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews). Sites invisible
    to AI Overviews lose ~68% of traffic vs ~12% for cited sites.

  New rules:

  - `aeo/llms-txt` — checks for `/llms.txt` at the origin and validates the
    minimal shape (H1 title, at least one `##` section, markdown link entries).
  - `aeo/crawler-access` — parses `robots.txt` per user-agent and flags blocked
    AI crawlers (GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Bytespider,
    Google-Extended, CCBot, Applebot-Extended). Warns per blocked crawler,
    errors when all are blocked.
  - `aeo/freshness-signals` — checks each page for a dateModified signal
    (JSON-LD, `article:modified_time`, visible "Last updated" text). Warns when
    absent, emits info when older than 180 days.
  - `aeo/faq-coverage` — detects FAQ-style content (question-phrased H2s or
    URL patterns like `/how-to-*`, `/what-is-*`, `*-faq`) that lacks FAQPage
    or HowTo JSON-LD.
  - `aeo/answer-first` — scores the first paragraph after the H1 for
    extractable-answer quality: concrete facts, named entities, complete
    sentence, boilerplate detection, and template-opener detection via entity
    masking across the corpus.
  - `aeo/citable-facts` — counts unique, entity-specific citable facts per page
    (dollar amounts, percentages, timeframes, dates, Form numbers). Filters out
    template facts shared across the majority of masked pages.
  - `aeo/non-replicable-value` — detects pages that are pure informational text
    with no interactive element, downloadable asset, or gated content — pages
    AI can fully summarize without sending a click.
  - `aeo/content-modularity` — splits pages by H2/H3 and flags sections that
    aren't independently extractable (cross-references like "as mentioned above",
    vague headings like "More Info", paragraphs over 200 words).

  ### Scoring

  Category weights re-balanced. `aeo` joins the composite score at 15%:

      before (0.2.x): spam 0.40 / content 0.25 / links 0.15 / tech 0.10 / schema 0.05 / cannibal 0.05
      after  (0.3.0): spam 0.35 / content 0.20 / aeo  0.15 / links 0.12 / tech 0.08 / schema 0.05 / cannibal 0.05

  `AuditSummary.categoryScores` now includes an `aeo` field.

  ### Config

  New flat threshold keys in `AuditOptions.rules` (all optional, sensible
  defaults):

  - `answerFirstMaxWords` (default 100) — opener length cap for `aeo/answer-first`
  - `citableFactsMin` (default 3) — below this a page errors
  - `citableFactsTarget` (default 8) — at or above this a page passes
  - `freshnessMaxStaleDays` (default 180) — age at which `dateModified` is flagged stale
  - `modularityMaxParagraphWords` (default 200) — `aeo/content-modularity`
  - `modularityMinSelfContainedRatio` (default 0.7) — `aeo/content-modularity`
  - `faqMinQuestionHeadings` (default 2) — `aeo/faq-coverage`

  Page-group `overrides` still apply normally for severity tuning.

  ### AEO sub-score and console section

  `categoryScores.aeo` is the sub-score (raw 0–100 damage — lower is better) and
  has its own label scheme distinct from the SpamBrain Risk label:

  - 0–20 **AI-Ready** — pages structured for citation
  - 21–40 **Partial** — some citable, others vulnerable
  - 41–60 **Vulnerable** — most pages will be summarized away without clicks
  - 61–80 **Invisible** — pages offer nothing AI can't synthesize itself
  - 81–100 **Ghost** — blocked from AI + no citable structure; traffic will crater

  `aeoScoreLabel(score)` is exported from `@pseolint/core` so downstream formatters
  can surface the label. The console formatter renders a dedicated
  **AEO: AI Overview Readiness** section between group scores and AI triage when
  any `aeo/*` findings are present.

  ### AI triage

  Prompt bumped to `1.1.0` (additive). The system prompt now explicitly
  distinguishes two threat families — **SpamBrain penalty risk** (spam/cannibal/
  content/data/tech/schema/links) and **AI Overview invisibility** (aeo/\*) — and
  asks for at least one root cause from each when both families are present. A
  new `findingCountByCategory` field in the prompt payload gives the model
  per-category totals for weighting.

- bfcccc0: feat(core): diff-mode audits + per-rule scope declarations

  Adds a declarative `RULE_SCOPE` map at `rules/scope.ts` that marks every
  rule ID as either `"page"` (output depends only on a single parsed page)
  or `"corpus"` (needs the full set of pages — clustering, cross-page
  comparisons, the link graph, robots.txt).

  New `AuditOptions.mode`:

  - `"full"` (default) — runs all rules; identical to prior behaviour.
  - `"diff"` — skips corpus-scoped rules so daily diff-audits
    can re-evaluate only changed pages without
    re-running clustering / link-graph / sitemap
    rules against the unchanged corpus.

  Consumed by the hosted monitoring pipeline (`apps/web`
  `inngest/functions/monitor-domains.ts`). Local CLI and MCP flows are
  unaffected — the default remains `"full"`.

  Public API additions:

  - `RULE_SCOPE` — `Record<string, RuleScope>`, complete map of all 42
    current rule IDs.
  - `isRuleAllowedInDiff(ruleId)` — returns true for page-scoped rules;
    unknown IDs default to corpus (safer).
  - `RuleScope` type — `"page" | "corpus"`.

  AEO rules are included in the scope map: `aeo/freshness-signals`,
  `aeo/faq-coverage`, `aeo/answer-first`, `aeo/citable-facts`,
  `aeo/non-replicable-value`, `aeo/content-modularity` are page-scoped;
  `aeo/llms-txt` and `aeo/crawler-access` are corpus-scoped (they need
  origin-level state).

  Note: `answer-first` and `citable-facts` perform cross-page template
  detection internally, but in diff mode they receive only the changed
  pages — template-fact and template-opener detection are effectively
  scoped to the diff set, not the historical corpus. This is acceptable
  for daily re-runs; full audits remain the source of truth for
  corpus-wide patterns.

## 0.2.2

### Patch Changes

- fix(publish): rewrite `workspace:*` to real semver in published dependencies

  The 0.2.1 tarballs shipped with `workspace:*` in their `dependencies` lists, which npm cannot resolve. Any `npx pseolint` or `npm install pseolint` silently failed. Republishing via `changeset publish` rewrites the workspace protocol to the real version range.
