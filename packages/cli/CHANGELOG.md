# pseolint

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

  C: binary-threshold redesigns:

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

  D: presence-quality (validate the value, not just its presence):

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
  - @pseolint/mcp@0.7.1

## 0.7.0

### Minor Changes

- v0.7.0: Calibration & authority foundations

  - **Two-sided calibration harness + score-vs-outcome instrument.** New `calibrationMetrics()` reports how well the risk score tracks real winning/penalized outcomes against a labeled corpus: threshold-free AUC, class-separation gap, per-band empirical penalty rate, and the over-flag / recall-leak confusion-zone sites. A `detectability` corpus field separates the engine's addressable ceiling from structurally-undetectable (off-page) cases.
  - **Corpus-derived entity auto-masking** (`deriveEntityPatterns`): clusters pages by URL template and masks tokens that vary across siblings, lifting policy-violating recall (44% → 56% on the calibration corpus) and fixing the reputable-vs-spam risk inversion.
  - **Domain-authority moderation scaffolding**: a pluggable `AuthorityProvider` (`CompositeAuthorityProvider` max-combine, `OpenPageRankProvider`, `CommonCrawlProvider`) feeds the existing verdict-shift. Fail-safe no-op until an authority source is configured: no behaviour change by default.

### Patch Changes

- Updated dependencies [ba1c6ca]
- Updated dependencies
  - @pseolint/core@0.7.0
  - @pseolint/mcp@0.7.0

## 0.6.4

### Patch Changes

- flush a partial `truncated:true` report on watchdog abort + warn on localhost concurrency override

  When the backpressure watchdog aborted a crawl mid-flight (the real user run at
  `--concurrency 5` against a single-process dev server), the `OriginDegradedError`
  propagated out of `auditSource()` and every downstream phase (dedup, rules,
  enrichment, scoring, report assembly) was skipped: the CLI caught the error,
  printed "aborted; origin looks degraded", and exited 1 with **zero output**.
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

- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @pseolint/core@0.6.5
  - @pseolint/mcp@0.6.5

## 0.6.2

### Patch Changes

- Track `@pseolint/core` 0.6.2: Wikipedia bloom filter now inlined as base64: fixes ENOENT errors on Vercel serverless deployments. CLI surface unchanged.

## 0.6.1

### Patch Changes

- Track `@pseolint/core` 0.6.1: new `AuditOptions.classifierUrls` lets callers feed the full URL set to the classifier while auditing a subset. Closes the v0.6.0 calibration validation gap. CLI surface unchanged.

## 0.6.0

### Minor Changes

- Track `@pseolint/core` 0.6.0: `siteVerdictFromTemplates` wired as default verdict source (spec §15.1). Verdict for sites with qualifying templates now comes from the worst-template-≥5%-coverage rule. Legacy single-template and `unclear`/`small-marketing` sites unaffected. CLI surface unchanged.

## 0.5.15

### Patch Changes

- Track `@pseolint/core` 0.5.15: filesystem-mode in `loadPagesFromSource` now reads `_manifest.json` to present fixture HTML with original URLs. Calibration corpus is now fully deterministic via the fixture system. CLI surface unchanged.

## 0.5.14

### Patch Changes

- Track `@pseolint/core` 0.5.14: value-add composite now aggregates 7 signals (added wikipedia-paraphrase). Each signal weighted at 1/7. CLI surface unchanged.

## 0.5.13

### Patch Changes

- Track `@pseolint/core` 0.5.13: Wise calibration drift fixed (engine bug in `links/unreachable-from-root` for pinned-URL audits + corpus annotation update); new `content/wikipedia-paraphrase` rule fires automatically on `pseolint scan` when page text overlaps ≥40% with the bundled Wikipedia trigram corpus.

## 0.5.12

### Patch Changes

- Track `@pseolint/core` 0.5.12 (calibration stability via pinned URL sampling). CLI surface unchanged: pinned URLs are an internal calibration concern. The new `AuditOptions.pinnedUrls` is available to programmatic callers if needed.

## 0.5.11

### Patch Changes

- Track `@pseolint/core` 0.5.11: new `content/common-phrase-reuse` rule fires automatically on `pseolint scan` when ≥3 pSEO marketing clichés are present per page; value-add composite now aggregates 6 signals (added common-phrase reuse).

## 0.5.10

### Patch Changes

- **v0.6 phase 3: per-template flags on `pseolint scan`.**
  - `--per-template` (default ON): render per-template cards above the per-URL findings list when ≥2 templates are detected. Use `--no-per-template` to disable.
  - `--template <signature>`: filter findings to one template's `auditedUrls` (e.g. `--template /listing/:slug`). Silently ignored when the signature doesn't match any detected template (CI configs may go stale across runs; soft-fail beats hard-fail).
  - `--legacy-flat`: opt-out flag that takes priority over `--per-template` when both are set. Renders the legacy per-URL-only view for users who have built tooling against the flat list.
- 11 new CLI test cases covering flag parsing, defaults, and mutual-exclusivity resolution.

## 0.5.9

### Patch Changes

- Track `@pseolint/core` 0.5.9: v0.6 phase 1 lands in the engine (additive `templates` field on audit JSON output for multi-template sites). CLI surface unchanged: phase 3 (v0.5.11) wires `--per-template` and `--legacy-flat` flags.

## 0.5.8

### Patch Changes

- Track `@pseolint/core` 0.5.8: new `content/value-add` composite rule fires automatically on `pseolint scan` when the per-page quality score lands below 0.5.

## 0.5.7

### Patch Changes

- Track `@pseolint/core` 0.5.7: `content/regurgitated-content` now uses cheerio for DOM traversal (no behavior change); bestfirenze.com regression test added to the calibration suite; reputable-corpus sweep doc shipped.

## 0.5.6

### Patch Changes

- **Inline upload after scan.** New `--upload-to <endpoint>`, `--upload-token <token>`, `--upload-domain-id <id>` flags on the main scan command. After the audit completes, the JSON summary is POSTed to `<endpoint>/api/audits/upload` with the bearer token. Replaces the two-step flow (`pseolint scan -o report.json` then `pseolint upload report.json`) with a single command. Token + domain ID can also come from `PSEOLINT_TOKEN` / `PSEOLINT_DOMAIN_ID` / `PSEOLINT_ENDPOINT` env vars. The summary uploaded is always canonical JSON regardless of `--format`. Token issuance lives in the dashboard at `/dashboard/settings/tokens`.
- New shared `uploadSummary({ summary, token, domainId, endpoint })` helper in `commands/upload.ts`. The standalone `pseolint upload <report>` command now delegates to it after reading the report file.

## 0.5.5

### Patch Changes

- Track `@pseolint/core` 0.5.5: large pSEO sites now get stratified URL coverage across templates (matters when sample budget < total candidate URLs), and `content/regurgitated-content` flags Google Places API regurgitation patterns. No CLI flag changes: both fire automatically.

## 0.5.4

### Patch Changes

- Track `@pseolint/core` 0.5.4: new `content/translation-no-op` rule fires automatically on `pseolint scan` when locale-prefixed siblings share identical content. No CLI flag changes.

## 0.5.3

### Patch Changes

- Track `@pseolint/core` 0.5.3: pulls in the engine grading rethink (classifier degeneration guard, blocker density floor) and the new `force.urls` audit option used by hosted monitoring. No CLI surface changes: the new options are caller-controlled and not exposed as flags yet (see v0.5.4 for `--upload-to` and `--watch`).

## 0.5.0

### Minor Changes

- v0.5.0 (continued): `pseolint orchestrate` subcommand

  Wraps `@pseolint/core` v0.5.0's new `orchestrate()` API as a CLI command.

  ```bash
  export ANTHROPIC_API_KEY=sk-...
  pseolint orchestrate https://example.com \
    --max-cost 3 \
    --ndjson session.ndjson \
    --manifest-out manifest.json
  ```

  Live event stream to stdout with ANSI colors: tool calls, results,
  thoughts, per-step token + cost + duration, watchdog firings, budget
  warnings, session terminus.

  End-of-run summary: verdict + 4 category grades, page / template /
  domain patch counts, `valid/total` patches with the first 10 dropped
  patches surfaced.

  Three exit codes: 0 = completed + all patches valid · 1 = session
  didn't reach finish_audit · 2 = completed but some patches were
  rejected by validators (manifest still written).

  Options mirror the public API: `--ai-provider`, `--ai-model`, `--ai-key`,
  `--max-cost <usd>`, `--max-tool-calls <n>`, `--max-wall-seconds <n>`,
  `--watchdog <n>` (0 disables), `--ndjson <path>`, `--manifest-out <path>`,
  `--quiet`, `--no-color`.

### Minor Changes

- v0.5.0: Change-driven monitoring CLI surface

  Tracks `@pseolint/core` v0.5.0. New flags:

  - `--mode <monitoring|fresh>`: explicit monitoring control. `monitoring`
    applies the pre-fetch decision matrix (default when prior state exists);
    `fresh` forces a full re-audit even when prior state is present.
  - `--age-floor-days <n>`: minimum days since a URL's last fetch before
    monitoring forces a re-fetch regardless of other signals (default: 7).
  - `--since` is now an alias for `--mode=monitoring` (back-compat).

  End-of-run summary line when monitoring is active:

  ```
  Monitoring: 47/4012 URLs re-scraped (recheck=23, lastmod=12, age=8, new=4),
  3965 carried forward.
  ```

  When `fetched < intended`, the line shows both ("X/Y (intended)"), surfacing
  URLs the matrix wanted to refetch but downstream filters dropped (robots,
  byte budget, content-type, 4xx).

  Filesystem-source bypass now logs a one-line warning when explicit
  `--mode=monitoring` or `--since` is requested against a local source.

  See spec: `docs/superpowers/specs/2026-05-01-change-driven-monitoring-design.md`.

## 0.4.3

### Patch Changes

- v0.4.3: classification-driven scoring, fixes credibility crisis

  Trigger: an external reviewer ran pseolint on his own site and didn't
  believe the verdict. Three-site dogfood (nextjs.org, wordpress.com,
  shopify.com) confirmed the issue: nextjs.org would score `concerning`
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
    break (one declaration breaks them all; count shouldn't compound).
    `tech/canonical-consistency` lowered to base 8, perInstance 1.
  - Formatters surface "Audited as &lt;type&gt; (NN% confidence)." prominently.
    Confidence caveats render after low-/speculative-confidence findings.
  - Marketing copy on /, /tools, /rules, /symptoms, /limits clarifies
    scope: "pseolint audits programmatic-SEO + AI Overview readiness.
    Not a general SEO audit; for Core Web Vitals and broken links use
    Sitebulb, Screaming Frog, or Ahrefs."

  **Dogfood results (post-change):**

  ```
  nextjs.org      ready (14)   → ready (15)   no regression
  react.dev       caution (23) → ready (15)   improved
  stripe.com      [aborted]    → ready (9)    correctly classifies localized
  wordpress.com   caution (24) → ready (12)   improved
  shopify.com     concerning(58)→ caution(28) -30 risk; remaining findings real
  ```

  Tests: 663/663 pass (was 646 in v0.4.2; +17 new tests for classifier
  types, scoring profiles, confidence emission, formatter output).

  **Reasoning trail:** see
  `docs/superpowers/specs/2026-04-30-pseolint-scoring-credibility.md`
  for the full diagnosis + design rationale.

- Updated dependencies
  - @pseolint/core@0.4.3
  - @pseolint/mcp@0.4.3

## 0.4.2

### Patch Changes

- v0.4.2: page-skip extensions, framework-aware web defaults, template bucketing, fixplan artifact

  **@pseolint/core (0.4.1 → 0.4.2)**

  Three new page-skip filters extending the v0.4.1 noindex / auth machinery:

  - `skipBoilerplate?: boolean` (default `false`): skip cookie / legal /
    consent / imprint pages via title, H1, or URL pathname matching
    well-known compliance-page patterns (`/privacy`, `/terms`, `/cookies`,
    `/gdpr`, `/ccpa`, `/impressum`, `/disclaimer`, `/accessibility`,
    `/do-not-sell`, etc.). Single-signal trigger because patterns are
    anchored; a marketing page that mentions "privacy" in its body won't
    fire. New `detectBoilerplatePage(page)` exported from `./page-filter.js`.
  - `skipSearchPages?: boolean` (default `false`): skip pages with
    search-result URL hallmarks: query parameter `q` / `query` / `search` /
    `s` / `keyword`, or pathname starting with `/search`. Per Google's own
    guidance these should be `noindex`'d but many sites don't tag them.
  - `skipEmptyBody?: boolean` (default `false`): skip un-hydrated SPA
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
    template: fix once, resolve all 23.`). Single-instance findings keep
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

- Updated dependencies
  - @pseolint/core@0.4.2
  - @pseolint/mcp@0.4.2

## 0.4.1

### Patch Changes

- v0.4.1: config UX fixes + page-skip policy

  **@pseolint/core (0.4.0 → 0.4.1)**

  - New `respectNoindex?: boolean` (default `true`): pages explicitly marked
    `noindex` (via `<meta name="robots">` or `X-Robots-Tag` header) are
    excluded from rule evaluation. The site owner already opted out of SEO
    indexing for them; auditing produces noise the reader can't act on. The
    two noindex-conflict rules (`tech/canonical-noindex-conflict`,
    `tech/robots-noindex-conflict`) and `tech/hreflang-consistency` still
    receive noindex'd pages so they can flag accidental noindex'ing /
    inconsistent hreflang declarations.
  - New `skipDetectedAuth?: boolean` (default `false`): heuristic detection
    of login / signup / password-reset / verify-email pages via password-input
    density, page title pattern (brand-suffix-stripped), and H1 pattern.
    Requires 2+ signals for a positive verdict, keeping false-positives low
    on marketing pages with single-signal characteristics.
  - New `audit/skipped-by-policy` diagnostic surfaces every URL skipped by the
    above policies in `summary.diagnostics.auditFindings`; the
    accidentally-noindex'd page now shows up as a visible skip line instead of
    being absent without explanation.
  - New `warnUnmatchedIgnore?: boolean` (default `false`): per-pattern warning
    for unmatched `--ignore` patterns is now opt-in. The CLI sets it to true
    only when `--ignore` came from the command line. Config-loaded patterns
    (e.g. `pseolint.config.ts` with broad safety patterns like `**/api/**`)
    no longer spam warnings when the patterns legitimately don't match a
    small site's surface. A consolidated `none of the N ignore patterns
    matched any URLs: check config or --ignore for typos` warning still
    fires when ALL patterns miss, regardless of source.
  - New helpers exported from the entry point: `detectNoindex`,
    `detectAuthPage`, `pageSkipReason` from `./page-filter.js`.

  **pseolint CLI (0.4.0 → 0.4.1)**

  - `pseolint.config.ts` files are now auto-loaded via cosmiconfig (jiti
    loader). Previously only `.js` / `.cjs` / `.mjs` / `.json` configs were
    picked up; `.ts` files silently fell through, forcing users to inline
    `--ignore` patterns. Both `pseolint.config.ts` and `.mts` variants are
    now in the searchPlaces list.
  - New flag `--no-respect-noindex`: audit pages marked noindex anyway
    (useful when investigating an accidentally-noindex'd page).
  - New flag `--skip-detected-auth`: opt into the heuristic auth-page skip.

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

- Updated dependencies
  - @pseolint/core@0.4.1
  - @pseolint/mcp@0.4.1

## 0.4.0

### Minor Changes

- v0.4.0: engine redesign

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
  - `--threshold` deprecated with a runtime warning: still functional for
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

  Pre-existing v0.3 JSON reports remain readable: `/r/[slug]` and
  `/r/compare` in the web app detect `summary.schemaVersion` and route
  through legacy renderers. New CI gates should switch from
  `--threshold 40` (numeric) to `--ci-threshold concerning` (semantic).

  Spec: `docs/superpowers/specs/2026-04-29-pseolint-v0.4-engine-redesign.md`.

### Patch Changes

- Updated dependencies
  - @pseolint/core@0.4.0
  - @pseolint/mcp@0.4.0

## 0.3.1

### Patch Changes

- v0.3.3: safeMode preset, CLI safety flags, MCP safe-by-default

  Consolidates the safety work from render-analytics blocking (v0.3.1),
  SSRF / AbortSignal / robots-honor (v0.3.2), and the safeMode preset
  (v0.3.3) for the CLI and MCP packages, which skipped the prior
  intermediate releases on npm.

  ## @pseolint/core → 0.3.3

  Incremental over 0.3.2 (which shipped SSRF guard, AbortSignal support,
  and robots.txt honour for our own crawler):

  - `safeMode: "saas" | "cli"` preset on `AuditOptions`: flips
    `guardSsrf`, `respectRobotsTxt`, `followRedirects`, `maxCrawlDiscovered`,
    and `maxFetchBytes` defaults in one knob. Individual option overrides
    still win.
  - `safeFetch(url, options?)`: SSRF-safe fetch for non-audit use cases
    (webhook URL verification, favicon lookups, etc.). Wraps `cachedFetch`
    with `validateTargetHost` baked in.
  - `maxCrawlDiscovered`: hard ceiling on link-discovery fan-out so a
    malicious site with many self-links can't extend crawl up to the byte
    budget. Default 5000 (2000 under `safeMode: "saas"`).
  - `followRedirects: false` option: returns 3xx as-is so security-
    sensitive audits can report redirects without following them.

  New exports: `safeFetch`, `SafeMode` type.

  ## pseolint (CLI) → 0.3.1

  First CLI release since 0.3.0; bundles the v0.3.1 / v0.3.2 / v0.3.3
  CLI-facing work:

  - Render-mode analytics blocking flags: `--analytics <block|allow|allow-first-party>`,
    `--block-host <host>` (repeatable). Prevents rendered audits from
    firing GA / Plausible / PostHog / Mixpanel / Hotjar / Sentry beacons
    on every page.
  - `--safe-mode <saas|cli>`: applies the core preset.
  - `--no-respect-robots`: audit sitemap URLs even when the target's
    robots.txt Disallow's them (use for your own staging sites).
  - `--no-follow-redirects`: report 3xx as-is.
  - `ctrl-C` handler: SIGINT triggers a clean abort via `AbortController`;
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

  `@pseolint/action`: runs in GitHub-public-network runners, auto-
  propagates new core features through its existing `AuditSummary`
  rendering. No separate bump.

  ## Test state

  528 / 528 tests pass. Typecheck clean across core / cli / mcp / action.

- Updated dependencies
  - @pseolint/core@0.3.3
  - @pseolint/mcp@0.3.1

## 0.3.0

### Minor Changes

- 01627a8: feat: add AEO rule category with 8 rules for AI Overview readiness

  Introduces `aeo/*`, a new scored rule category focused on Answer Engine
  Optimization. Brings the total to **42 rules across 8 categories** (7 scored

  - `data/*`). While SpamBrain rules protect against Google penalties, AEO
    rules audit whether pSEO pages are structured to be cited in AI Overviews
    (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews). Sites invisible
    to AI Overviews lose ~68% of traffic vs ~12% for cited sites.

  New rules:

  - `aeo/llms-txt`: checks for `/llms.txt` at the origin and validates the
    minimal shape (H1 title, at least one `##` section, markdown link entries).
  - `aeo/crawler-access`: parses `robots.txt` per user-agent and flags blocked
    AI crawlers (GPTBot, ChatGPT-User, ClaudeBot, PerplexityBot, Bytespider,
    Google-Extended, CCBot, Applebot-Extended). Warns per blocked crawler,
    errors when all are blocked.
  - `aeo/freshness-signals`: checks each page for a dateModified signal
    (JSON-LD, `article:modified_time`, visible "Last updated" text). Warns when
    absent, emits info when older than 180 days.
  - `aeo/faq-coverage`: detects FAQ-style content (question-phrased H2s or
    URL patterns like `/how-to-*`, `/what-is-*`, `*-faq`) that lacks FAQPage
    or HowTo JSON-LD.
  - `aeo/answer-first`: scores the first paragraph after the H1 for
    extractable-answer quality: concrete facts, named entities, complete
    sentence, boilerplate detection, and template-opener detection via entity
    masking across the corpus.
  - `aeo/citable-facts`: counts unique, entity-specific citable facts per page
    (dollar amounts, percentages, timeframes, dates, Form numbers). Filters out
    template facts shared across the majority of masked pages.
  - `aeo/non-replicable-value`: detects pages that are pure informational text
    with no interactive element, downloadable asset, or gated content: pages
    AI can fully summarize without sending a click.
  - `aeo/content-modularity`: splits pages by H2/H3 and flags sections that
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

  - `answerFirstMaxWords` (default 100): opener length cap for `aeo/answer-first`
  - `citableFactsMin` (default 3): below this a page errors
  - `citableFactsTarget` (default 8): at or above this a page passes
  - `freshnessMaxStaleDays` (default 180): age at which `dateModified` is flagged stale
  - `modularityMaxParagraphWords` (default 200): `aeo/content-modularity`
  - `modularityMinSelfContainedRatio` (default 0.7): `aeo/content-modularity`
  - `faqMinQuestionHeadings` (default 2): `aeo/faq-coverage`

  Page-group `overrides` still apply normally for severity tuning.

  ### AEO sub-score and console section

  `categoryScores.aeo` is the sub-score (raw 0–100 damage; lower is better) and
  has its own label scheme distinct from the SpamBrain Risk label:

  - 0–20 **AI-Ready**: pages structured for citation
  - 21–40 **Partial**: some citable, others vulnerable
  - 41–60 **Vulnerable**: most pages will be summarized away without clicks
  - 61–80 **Invisible**: pages offer nothing AI can't synthesize itself
  - 81–100 **Ghost**: blocked from AI + no citable structure; traffic will crater

  `aeoScoreLabel(score)` is exported from `@pseolint/core` so downstream formatters
  can surface the label. The console formatter renders a dedicated
  **AEO: AI Overview Readiness** section between group scores and AI triage when
  any `aeo/*` findings are present.

  ### AI triage

  Prompt bumped to `1.1.0` (additive). The system prompt now explicitly
  distinguishes two threat families: **SpamBrain penalty risk** (spam/cannibal/
  content/data/tech/schema/links) and **AI Overview invisibility** (aeo/\*), and
  asks for at least one root cause from each when both families are present. A
  new `findingCountByCategory` field in the prompt payload gives the model
  per-category totals for weighting.

### Patch Changes

- Updated dependencies [01627a8]
- Updated dependencies [bfcccc0]
  - @pseolint/core@0.3.0
  - @pseolint/mcp@0.3.0

## 0.2.3

### Patch Changes

- fix(cli): run when the installed binary is a symlink (`npm link`, Windows global shim)

  The direct-run guard compared `import.meta.url` to a URL built from `process.argv[1]`, which diverges when the real file lives on another path (symlink/junction). The process exited 0 without running any command, including `--version` and audits.

- fix(publish): rewrite `workspace:*` to real semver in published dependencies

  The 0.2.1 tarballs shipped with `workspace:*` in their `dependencies` lists, which npm cannot resolve. Any `npx pseolint` or `npm install pseolint` silently failed. Republishing via `changeset publish` rewrites the workspace protocol to the real version range.

- Updated dependencies
  - @pseolint/core@0.2.2
  - @pseolint/mcp@0.2.2
