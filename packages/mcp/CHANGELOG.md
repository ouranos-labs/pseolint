# @pseolint/mcp

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

- Updated dependencies
  - @pseolint/core@0.3.3

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

### Patch Changes

- Updated dependencies [01627a8]
- Updated dependencies [bfcccc0]
  - @pseolint/core@0.3.0

## 0.2.2

### Patch Changes

- fix(publish): rewrite `workspace:*` to real semver in published dependencies

  The 0.2.1 tarballs shipped with `workspace:*` in their `dependencies` lists, which npm cannot resolve. Any `npx pseolint` or `npm install pseolint` silently failed. Republishing via `changeset publish` rewrites the workspace protocol to the real version range.

- Updated dependencies
  - @pseolint/core@0.2.2
