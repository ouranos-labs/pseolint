# @pseolint/core

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
