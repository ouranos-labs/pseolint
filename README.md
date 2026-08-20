<p align="center">
  <img src="docs/assets/logo.svg" alt="pSEO Lint: audit your pSEO site by template, not by URL" width="720" />
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pseolint"><img src="https://img.shields.io/npm/v/pseolint?color=cb3837&logo=npm" alt="npm" /></a>
  <a href="https://www.npmjs.com/package/pseolint"><img src="https://img.shields.io/npm/dm/pseolint?color=cb3837" alt="Downloads" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/pseolint?color=blue" alt="License" /></a>
  <a href="https://www.npmjs.com/package/pseolint"><img src="https://img.shields.io/node/v/pseolint?color=339933&logo=node.js" alt="Node" /></a>
  <a href="https://github.com/ouranos-labs/pseolint"><img src="https://img.shields.io/github/stars/ouranos-labs/pseolint?style=social" alt="GitHub stars" /></a>
  <a href="https://glama.ai/mcp/servers/ouranos-labs/pseolint"><img src="https://glama.ai/mcp/servers/ouranos-labs/pseolint/badges/score.svg" alt="ouranos-labs/pseolint MCP server" /></a>
  <a href="https://pseolint.dev/leaderboard"><img src="https://pseolint.dev/api/badge/pseolint.dev" alt="pseolint.dev dogfood" /></a>
</p>

<p align="center">
  <strong><a href="https://pseolint.dev/methodology">Methodology</a></strong> ·
  <strong><a href="https://pseolint.dev/leaderboard">Leaderboard</a></strong> ·
  <strong><a href="https://github.com/ouranos-labs/pseolint/issues/new">Report a bug</a></strong> ·
  <strong><a href="skills/README.md">Skills for agents</a></strong>
</p>

<p align="center">
  <img src="docs/assets/demo.svg" alt="pseolint auditing pseolint.dev: verdict READY, all four categories graded A, with a per-template breakdown of /rules/:slug, /tools/:slug, and long-tail pages" width="820" />
</p>

The only tool purpose-built for **programmatic SEO compliance**. It shifts the unit of analysis from URL to template: point it at a 10,000-URL pSEO directory and pseolint identifies the template clusters (e.g. `/listing/:slug`, `/category/:slug`), samples K pages from each, and produces a per-template verdict + variance metric. **Fix one template, fix N pages.**

```bash
npx pseolint http://localhost:3000
```

<details>
<summary><strong>Table of contents</strong></summary>

- [Why this exists](#why-this-exists)
- [How pseolint differs](#how-pseolint-differs)
- [Quick Start](#quick-start)
- [What It Checks](#what-it-checks): the 59 rules
- [CLI Options](#cli-options)
- [GitHub Action](#github-action)
- [Fix rail: from audit to pull request](#fix-rail--from-audit-to-pull-request)
- [Skills for Claude & coding agents](#skills-for-claude--coding-agents-new)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

</details>

## Skills for Claude & coding agents (new)

Design pages that pass *before* you crawl them. The [`skills/`](skills/) suite gives
Claude (and any agent that supports the `skills` / Claude Code plugin format)
programmatic-SEO and **answer-engine optimization (AEO / GEO)** guidance where
every recommendation is bound to a runnable pseolint rule:

```bash
npx skills add ouranos-labs/pseolint --skill pseolint aeo
```

- **`pseolint`**: full-lifecycle programmatic SEO: design → build → audit → fix → gate.
- **`aeo`**: get cited in AI Overviews / ChatGPT / Perplexity, not just ranked.

Unlike prose checklists, these have teeth: the design-time advice ends in
`npx pseolint` pass/fail. See [`skills/README.md`](skills/README.md).

## Why this exists

Programmatic SEO works, when it works. The gap between "1,000 indexed pages" and "1,000 pages that survive a SpamBrain pass" is where most pSEO sites die. The Helpful Content Update made that gap permanent.

Existing SEO tools (Screaming Frog, Sitebulb, Ahrefs Site Audit) were built for editorially-curated sites. They check pages one at a time. But the SpamBrain risks of pSEO are *between* pages: doorway clusters, near-duplicates, entity-swap templates, thin-content propagation. You can't catch them with per-page rules.

pseolint audits the graph: it groups results by template before surfacing them. Run it before you publish, gate it in CI, fix the broken template before SpamBrain does.

### How it compares

|  | pseolint | Screaming Frog | Ahrefs Site Audit | Sitebulb |
|---|:---:|:---:|:---:|:---:|
| Unit of analysis | **template cluster** | URL | URL | URL |
| Near-duplicate / doorway / entity-swap detection | ✅ | partial | - | - |
| SpamBrain-policy risk verdict | ✅ | - | - | - |
| AEO / AI-Overview citability checks | ✅ | - | - | - |
| AI fix → pull request | ✅ | - | - | - |
| CLI · GitHub Action · MCP server | ✅ | desktop | SaaS | desktop |
| Open source | ✅ MIT | - | - | - |

The general-purpose crawlers do plenty pseolint doesn't (JS rendering at scale, backlink data, log-file analysis). pseolint is the specialist for the one thing they weren't built for: **programmatic-SEO compliance at the template level.**

## How pseolint differs

- **Graph-level, not page-level.** Detects near-duplicate clusters, doorway patterns, and entity-swap doorways across thousands of pages. Per-page tools can't see these.
- **SpamBrain + AI Overview.** 59 rules across 8 categories: SpamBrain-policy mapping (penalty risk) plus `aeo/*` (AI Overview citability: `llms.txt`, AI-crawler access, citable facts, answer-first, summary-bait).
- **Developer workflow, not SaaS UI.** CLI, GitHub Action, JSON/HTML reports, MCP server, browser extension (SERP competitive recon). Lives in your repo and your PRs.
- **Actionable, not advisory.** Every finding has a fix, an effort tag (`quick fix` / `moderate` / `structural`), and a Google docs reference.
- **Safe for hosted use.** SSRF guard (DNS-validated), robots.txt honoured for our own crawler, analytics-blocking in render mode, `AbortSignal` cancellation, `safeMode: "saas"` preset for embedding in services.
- **Calibrated against reputable pSEO.** Engine verdicts are calibrated against a curated corpus of in-production pSEO sites that demonstrably win in search. Doorway-pattern findings cluster (no more per-pair noise); verdicts are reproducible at a fixed `sampleSeed`. Dated snapshot results, the open-source corpus, and the trade-offs we accepted live at [pseolint.dev/methodology](https://pseolint.dev/methodology). Spec: [docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md](./docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md).
- **Authority-blind by design, with a manual override.** pseolint analyses static content + the link graph it can see. It does NOT measure backlinks, brand mentions, domain age, or any external trust signal: there is no Moz/Ahrefs/Semrush dependency. This means the engine itself is calibrated for the authority tier of the calibration corpus (established brands). It exposes `authorityScore` (0-100, via the `--authority-score` CLI flag, the core API, or the MCP param) so callers can adjust the verdict ladder for their tier: `>= 80` shifts one tier lenient (established brand can absorb shapes a newer site can't); `<= 30` shifts one tier stricter. Raw `risk` number unchanged so CI gates stay stable. Without the flag, treat verdicts as a directional minimum.
- **Honest about blind spots.** Beyond domain authority, pseolint does not currently detect: image SEO dimensions, schema-content drift (e.g. JSON-LD price ≠ rendered price), outbound-link health, search-intent alignment, parameter-URL crawl-budget waste, and a handful of specialty gaps (mobile-friendliness, cookie-banner detection, AMP/News/Video schema). The complete blind-spot audit lives at [docs/superpowers/specs/2026-05-03-pseolint-blind-spots.md](./docs/superpowers/specs/2026-05-03-pseolint-blind-spots.md): every gap categorized by impact tier with the roadmap fix.

Full version history (calibration rounds, per-rule changes, safety hardening) is in [CHANGELOG.md](./CHANGELOG.md).

## Quick Start

```bash
# Point it at your local dev server: that's it
npx pseolint http://localhost:3000
```

Automatically discovers all pages by following internal links. No sitemap, no config, no build step needed.

```bash
# Save a visual report
npx pseolint http://localhost:3000 --format html --output report.html

# Audit a live site (per-template output is the default)
npx pseolint https://yoursite.com

# CI gate on build output
npx pseolint ./out --ci-threshold concerning --format json
```

### Per-template output (v0.6 default)

```
Verdict: CONCERNING
Integrity C · Discoverability B · Citation C · Data A

Per-template breakdown (3 templates):

  /listing/:slug  CONCERNING  C
  10/8201 URLs (0.1%)  uniformity 85%
  8/10 samples fail `spam/thin-content`

  /category/:slug  READY  A
  10/312 URLs (3.2%)  uniformity 94%

  /help/:slug  CAUTION  B
  10/47 URLs (21.3%)  uniformity 78%
  3/10 samples fail `content/missing-author`
```

`--format json` includes the `templates` array alongside the existing `findings` list:

```json
{
  "verdict": "concerning",
  "risk": 60,
  "templates": [
    {
      "signature": "/listing/:slug",
      "totalUrls": 8201,
      "auditedUrls": ["https://example.com/listing/foo", "..."],
      "verdict": "concerning",
      "risk": 60,
      "variance": {
        "uniformityScore": 0.85,
        "topDriver": { "ruleId": "spam/thin-content", "fireRate": 0.8 }
      }
    },
    { "signature": "/category/:slug", "verdict": "ready", "risk": 12 }
  ],
  "findings": [...]
}
```

Use `--legacy-flat` to suppress the template cards and get the v0.5-style flat findings list.

### Partial coverage (`truncated`)

If the crawl is interrupted (e.g. the backpressure watchdog aborts because the origin is degrading), pseolint still emits whatever it collected, flagged as partial:

```json
{
  "verdict": "ready",
  "risk": 12,
  "truncated": true,
  "truncatedReason": "Origin degraded mid-crawl (p95 latency exceeded threshold)",
  "pageCount": 42
}
```

When `truncated` is `true`, **treat `pageCount`, `risk`, and `verdict` as lower bounds**: a partial pass is not a full pass. The CLI prints a `PARTIAL REPORT` banner and exits non-zero; the GitHub Action warns (and can fail with `fail-on-truncated: true`); the MCP tools and web report surface the same flag. Programmatic consumers should branch on it. The full output contract is published as a JSON Schema (`packages/core/schemas/audit-summary.schema.json`, `$id` carries the `schemaVersion`).

## Audit Modes

| Mode | Command | What you get |
|------|---------|-------------|
| **Local dev server** | `npx pseolint http://localhost:3000` | Full rendered pages, HTTP headers, redirect detection, crawl discovery. **Best results.** |
| **Live site** | `npx pseolint https://yoursite.com` | Same as above against production. Slower (network latency). |
| **Build directory** | `npx pseolint ./out` | Static HTML files only. No HTTP headers, no redirect detection, no soft-404 detection, no sitemap comparison. Use for CI gates. |

> **Why localhost is recommended:** Build directories contain framework artifacts (Next.js `[slug].html` shells, empty client-rendered pages) that produce false positives. Your dev server renders the actual pages Google will see: with canonicals, meta tags, and full content.

## What It Checks

**59 rules** across **8 categories** (all 8 scored), producing a weighted **SpamBrain Risk Score** (0-100) and an independent **AEO sub-score** for AI Overview citability. Every rule is backed by a primary source (Google Search Central, sitemaps.org, ogp.me, Lighthouse); the checks we deliberately *refuse* to run (folklore the primary sources contradict, like title/description character limits) live in [docs/folklore.md](./docs/folklore.md):

### SpamBrain Risk Detection

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `spam/near-duplicate` | SimHash similarity between all page pairs (>85%) | Critical |
| `spam/entity-swap` | Doorway pages where only a proper noun changes | Critical |
| `spam/doorway-pattern` | Composite: entity-swap + thin + identical structure + same meta | Critical |
| `spam/thin-content` | Pages below 300 words (excluding nav/header/footer) | Error |
| `spam/boilerplate-ratio` | Pages with >70% shared template content | Error |
| `spam/template-diversity` | Identical DOM structure across all pages | Warning |
| `spam/publication-velocity` | >100 pages sharing the same publish date | Warning |
| `spam/template-coverage` | Template dimension coverage (e.g. 87 of 960 possible combinations) | Info |

### Content Quality

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `content/unique-value` | Each page must have 100+ words not found on any other page | Error |
| `content/meta-uniqueness` | Meta descriptions identical after entity masking | Error |
| `content/title-uniqueness` | Empty/missing title, very short or excessively long title, or two pages sharing the exact title (raw, not entity-masked: catalog templates with per-record entity values pass) | Error / Warning / Info |
| `content/heading-structure` | No `<h1>`, multiple `<h1>` elements, or long pages (>600 words) with no `<h2>` sub-headings | Error / Warning / Info |
| `content/image-alt-text` | `<img>` tags missing `alt` attribute (decorative images marked `role="presentation"` / `aria-hidden="true"` / `alt=""` are skipped) | Warning / Info |
| `content/missing-author` | No author schema, meta, byline, or rel="author" | Warning |
| `content/eeat-signals` | Missing E-E-A-T signals (author, dates, sources, about links) | Info |
| `content/citation-coverage` | Pages making 3+ quantified claims with no authoritative citations | Warning |
| `content/meta-description-presence` | Missing or empty meta description. Length is deliberately NOT linted: Google documents no character limit (see [docs/folklore.md](./docs/folklore.md)) | Warning |

### Internal Linking

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `links/orphan-pages` | Pages with zero inbound internal links | Error |
| `links/host-section-divergence` | Sub-sections (e.g. `/coupons/`, `/deals/`) that diverge from the rest of the host on ≥2 of: cross-section inbound links, topic vocabulary, template signature, authorship coverage. Targets Google's May 2024 site-reputation-abuse policy. | Warning / Error |
| `links/dead-ends` | Pages with zero outbound internal links | Warning |
| `links/cluster-connectivity` | Isolated page clusters with no cross-linking | Warning |
| `links/unreachable-from-root` | Pages with no path from the start URL (graph-disconnected from the entry point) | Warning |
| `links/link-depth` | Pages requiring >3 clicks from root | Info |
| `links/crawlable-anchors` | Links Google cannot follow: `<a>` without `href`, `javascript:` hrefs, onclick/router-attribute pseudo-links. Escalates to Error when a page's navigation is effectively invisible to crawlers | Warning / Error |
| `links/generic-anchor-text` | ≥50% of a page's internal links anchored on "click here" / "read more" / empty text, wasting the anchor signal Google (and AI answer engines) use to label the target | Info |

### Technical SEO

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `tech/canonical-consistency` | Missing, invalid, or conflicting canonical URLs (HTML + HTTP header) | Error |
| `tech/sitemap-completeness` | Pages missing from sitemap, phantom 404s, redirecting sitemap URLs | Error |
| `tech/csr-bailout` | Render-diff: substantive content / interactivity that appears only after client-side JS: invisible to crawlers and the first indexing pass (needs `--render`) | Warning |
| `tech/core-web-vitals` | Core Web Vitals in Google's "poor" tier. Default: lab LCP/CLS from a headless-Chromium render (needs `--render`). With a free CrUX API key (`--crux-api-key`), uses real-user field p75 for LCP/CLS **and INP**: the numbers Google ranks on | Warning |
| `tech/soft-404` | HTTP 200 pages that look like error pages: plus a synthetic-URL probe that fetches one nonexistent URL per template cluster (a 200 means the directory will index unbounded junk; needs `--render`) | Error |
| `tech/robots-compliance` | Sitemap URLs blocked by `robots.txt` (Disallow patterns matching listed pages) | Error |
| `tech/robots-noindex-conflict` | Noindexed pages (meta or X-Robots-Tag) with inbound links | Warning |
| `tech/canonical-noindex-conflict` | Noindex + canonical pointing elsewhere | Warning |
| `tech/redirect-chain` | Redirect chains longer than 2 hops | Warning |
| `tech/hreflang-consistency` | Hreflang reciprocity (A->B requires B->A) | Warning |
| `tech/og-completeness` | Missing `og:title`, `og:description`, or `og:image`: affects social-share previews and AI Overview fallback summaries | Warning |
| `tech/robots-sitemap-presence` | Missing or unreachable `/robots.txt` or `/sitemap.xml` at the origin | Warning |
| `tech/language-mismatch` | Declared language (html lang / self-referencing hreflang) vs the Unicode script of the actual text, e.g. `lang="ja"` on a Cyrillic page. Google indexes by DETECTED language, so mismatched declarations silently break all targeting | Error / Warning / Info |
| `tech/hreflang-validity` | Invalid hreflang codes (`en_US`, `jp`, `en-UK`); Google silently ignores the whole annotation | Warning |
| `tech/html-size` | HTML approaching Googlebot's 2 MB per-file crawl cutoff (uncompressed; content/links/JSON-LD past it are invisible). Per-file, not total page weight (see [docs/folklore.md](./docs/folklore.md)) | Error / Warning |
| `tech/meta-robots-conflict` | Contradictory robots directives across meta robots / meta googlebot / X-Robots-Tag. Google applies the MOST restrictive, so an accidental `noindex` silently wins | Error / Warning |
| `tech/snippet-suppression` | `nosnippet` / `max-snippet:0`, which kills SERP snippets and AI Overview / answer-engine citability | Warning / Info |
| `tech/viewport-meta` | Missing `<meta name="viewport">`; Google indexes mobile-first | Warning |
| `tech/sitemap-hygiene` | Cross-host sitemap URLs (dropped per sitemaps.org), future / unparseable / mass-identical `lastmod` values (Google ignores unreliable lastmod) | Error / Warning |
| `tech/robots-txt-limits` | robots.txt over Google's 500 KiB parse limit, or unsupported directives (`noindex:` in robots.txt has been ignored since 2019, so pages are NOT excluded) | Warning / Info |

### Data Consistency

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `data/missing-binding` | When `--data-source` is set, flags fields from the source record that don't appear on the matching page (e.g. FAQ items, regulation clauses listed in the source JSON but missing from rendered HTML) | Warning |
| `data/identical-across-pages` | Source-data fields that differ in the JSON but render identically across pages (suggests a missing binding loop or a hardcoded template value) | Warning |

### Structured Data

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `schema/json-ld-valid` | Malformed JSON-LD, missing @context or @type | Error |
| `schema/required-fields` | Article/Product/FAQ missing required fields | Warning |
| `schema/consistency` | Mixed schema types across template pages | Info |

### Cannibalization

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `cannibal/url-pattern` | URL structures with same tokens in different order | Info |

> `cannibal/title-overlap` and `cannibal/keyword-collision` were dropped in v0.4 due to high false-positive rates on legitimately similar pages (e.g. localized variants, paginated archives). See the [v0.4 redesign spec §4.3](./docs/superpowers/specs/2026-04-29-pseolint-v0.4-engine-redesign.md).

### AEO: AI Overview Readiness (v0.3.x)

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `aeo/llms-txt` | `/llms.txt` missing or malformed at the origin | Warning |
| `aeo/crawler-access` | `robots.txt` blocks `GPTBot` / `ClaudeBot` / `PerplexityBot` / `Bytespider` / `Google-Extended` / `CCBot` / `Applebot-Extended` / `ChatGPT-User` | Warning / Error |
| `aeo/freshness-signals` | No `dateModified` / modification meta / visible "Last updated" | Warning |
| `aeo/faq-coverage` | FAQ-style content (question-phrased H2s) without `FAQPage` / `HowTo` JSON-LD | Info |
| `aeo/answer-first` | First paragraph after H1 is boilerplate or lacks facts / named entities | Error |
| `aeo/citable-facts` | <3 entity-specific citable facts per page after template-fact filtering | Error |
| `aeo/content-modularity` | Sections that cross-reference each other or use vague headings: not independently extractable | Warning |
| `aeo/summary-bait` | Composite: strong opener + no interactive value + facts packed in opener → guaranteed zero-click loss | Error |

## Live URL Scanning

When you point pseolint at a URL, it captures what Google sees:

- **HTTP metadata**: status codes, redirect chains, X-Robots-Tag, Link headers
- **Crawl discovery**: follows internal links from the start page to find all crawlable pages
- **Sitemap comparison**: if a sitemap exists, compares it against crawl-discovered pages

```bash
# Just give it your homepage: it discovers everything
npx pseolint https://paperforge.dev
```

## Page Groups

Different page types need different standards. Configure groups in `pseolint.config.ts`:

```typescript
export default {
  pageGroups: {
    pseo: {
      match: '/templates/**',
      rules: ['spam/*', 'content/*', 'links/*', 'cannibal/*', 'tech/*', 'schema/*'],
      overrides: {
        'spam/thin-content': { thinContentMinWords: 500 },
      }
    },
    listing: {
      match: ['/documents', '/templates'],
      rules: ['tech/*'],
    },
    marketing: {
      match: ['/', '/about', '/pricing'],
      rules: ['tech/*'],
    },
    utility: {
      match: ['**/404*', '**/500*'],
      rules: [],  // skip entirely
    }
  }
};
```

Each group gets its own score. Unmatched pages get all rules.

## SpamBrain Risk Score

The risk score (0–100) aggregates rule penalties into **4 super-categories** (**Integrity** (spam + content + cannibal), **Discoverability** (links + tech), **Citation** (aeo + schema), and **Data**) with site-type-aware weights, so a programmatic directory and a docs site are each scored against the rule weighting that matches their archetype. Since v0.6, scoring runs **per template** and rolls up to a site verdict: the worst-scoring template that covers ≥5% of the audited URLs.

The score maps to a 4-rung **verdict ladder**, and CI gates on the verdict (`--ci-threshold`, default `concerning`), not a raw numeric band:

| Verdict | Meaning | CI exit (verdict ≥ threshold) |
|---------|---------|-------------------------------|
| `ready` | no material risk | 0 |
| `caution` | minor issues | 0 |
| `concerning` | likely penalty-pattern exposure | 1 |
| `critical` | strong penalty-pattern exposure | 1 |

See [pseolint.dev/methodology](https://pseolint.dev/methodology) for the calibrated weights and verdict thresholds.

## Actionable Output

Findings are automatically enriched before display:

- **Pairwise clustering**: Thousands of near-duplicate pair comparisons collapse into a handful of cluster findings: "48 pages form a near-duplicate cluster (86–94% similar)."
- **Content breakdown**: Each cluster shows what's shared vs. unique: "Shared: description of property (31w), buyer acknowledges (35w). Unique: 3324w of 8140w."
- **Effort tags**: Every finding is tagged `quick fix`, `moderate`, or `structural` so you know where to start.
- **Template detection**: When the tool detects template-generated content, fix suggestions speak to template authors: "Add conditional content sections per entity."

## CLI Options

```
Usage: pseolint [options] [command] [source]

Arguments:
  source                         URL or directory path to audit

Output
  -f, --format <type>            Output format: console | json | markdown | html (default: console)
  --ci-threshold <severity>      Min verdict that fails CI: ready|caution|concerning|critical (default: concerning)
  -t, --threshold <n>            [deprecated] Numeric risk threshold; use --ci-threshold instead
  -o, --output <file>            Write report to file instead of stdout
  --no-color                     Disable colored output

Crawl / fetch
  --concurrency <n>              Max parallel HTTP fetches (default: 5)
  --timeout <ms>                 Per-request timeout in ms (default: 30000)
  --no-crawl                     Disable crawl-based page discovery for URL sources
  --ignore <patterns>            Comma-separated glob patterns to exclude
  --render                       Render pages in a browser before auditing
  --browser-ws <url>             CDP WebSocket endpoint for browser rendering

Sampling
  --sample-size <n>              Audit N pages (default: 0 = all)
  --strategy <random|stratified> Sampling strategy (default: stratified)
  --max-per-template <n>         Cap samples per URL template cluster (default: 0)

Template output (v0.6)
  --per-template                 Render per-template cards above the findings list (default: ON)
  --template <signature>         Filter output to a single template, e.g. /listing/:slug
  --legacy-flat                  Suppress template cards; print the v0.5-style flat findings list

Cache & monitoring
  --cache [dir]                  Enable HTTP cache (default: .pseolint/cache)
  --cache-ttl <duration>         TTL for entries without validators, e.g. 7d, 1h, 30m (default: 7d)
  --state [path]                 Enable state persistence (default: .pseolint/state.json)
  --mode <monitoring|fresh>      v0.5+ change-driven monitoring mode. Auto-monitoring is the
                                 default when prior state exists. Use 'fresh' to force a full
                                 re-audit even with prior state.
  --age-floor-days <n>           v0.5+ minimum days since a URL's last fetch before monitoring
                                 forces a re-fetch regardless of other signals (default: 7)
  --since                        v0.5+ alias for --mode=monitoring (kept for back-compat)
  --exit-on-regression           Exit non-zero when new rule IDs fire vs prior --state

Data
  --data-source <file>           JSON file with source data for content-verification rules

AI triage (opt-in)
  --ai                           Enable AI triage of findings
  --ai-provider <id>             anthropic | openai | google | mistral | groq | xai | cohere | ollama
  --ai-model <name>              Model name (overrides provider default)
  --ai-endpoint <url>            AI endpoint (Ollama only; default: http://localhost:11434)
  --ai-max-tokens <n>            Input token cap per triage call (default: 60000)
  --ai-max-cost <usd>            Refuse a triage call whose pre-flight cost exceeds this USD
  --ai-daily-budget <usd>        Refuse triage when today's total spend would exceed USD (requires --telemetry)
  --ai-cache-ttl <duration>      Triage cache TTL, e.g. 30d, 12h, 60s (default: 30d)
  --no-ai-cache                  Bypass AI triage cache for this run
  --no-ai-suggest                Suppress AI discovery hint in non-AI runs

Telemetry (local, offline)
  --telemetry                    Enable local telemetry write (.pseolint/telemetry.jsonl)
  --telemetry-path <file>        Override telemetry JSONL path
  --no-telemetry-prompt          Suppress the y/n/skip triage feedback prompt
  --triage-feedback <rating>     Non-interactive feedback: helpful | unhelpful | y | n

MCP
  --mcp                          Start as an MCP server (for AI coding assistants)

Commands:
  stats                          Show aggregate telemetry stats from .pseolint/telemetry.jsonl
  stats-export <outPath>         Copy telemetry JSONL to <outPath> for manual review/sharing
```

### Caching & change-driven monitoring (v0.5)

```bash
# First run: populates .pseolint/cache and .pseolint/state.json with full baseline
npx pseolint https://yoursite.com --cache --state

# Subsequent runs auto-enter monitoring mode. The decision matrix decides which
# URLs to fetch BEFORE the network round-trip:
#   - new URL                         → fetch (reason: new)
#   - prior fetch ≥ 7 days old        → fetch (reason: age)
#   - ruleset version bumped          → fetch (reason: ruleset)
#   - prior warning/error finding     → fetch (reason: recheck): info findings carry forward
#   - sitemap <lastmod> newer         → fetch (reason: lastmod)
#   - none of the above + lastmod present → SKIP (carry findings forward)
npx pseolint https://yoursite.com --cache --state

# Force a full re-audit even with prior state
npx pseolint https://yoursite.com --cache --state --mode=fresh

# Lower the age-floor for tighter monitoring (default: 7 days)
npx pseolint https://yoursite.com --cache --state --age-floor-days=3

# CI gate that fails when a *new* rule ID starts firing on actually-fetched URLs
npx pseolint https://yoursite.com --cache --state --exit-on-regression
```

Sites whose sitemaps emit `<lastmod>` (Next.js, Yoast/WordPress, Astro) get the
biggest savings: typically ~95% fewer fetches on steady-state monitoring runs.
Sites without `<lastmod>` hit `no-signal` and refetch every URL; bandwidth is
still saved via cache.ts conditional GETs but round-trips aren't skipped (a
HEAD-fallback path is on the roadmap).

End-of-run summary line:
```
Monitoring: 47/4012 URLs re-scraped (recheck=23, lastmod=12, age=8, new=4), 3965 carried forward.
```

### AI triage

Turns hundreds of findings into a handful of ranked root causes. Opt-in, bring-your-own API key, with cost guardrails:

```bash
# Auto-detect provider from env (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.)
npx pseolint https://yoursite.com --ai

# Pin provider + model, cap spend
npx pseolint https://yoursite.com --ai \
  --ai-provider anthropic \
  --ai-model claude-haiku-4-5 \
  --ai-max-cost 0.50

# Local-only (Ollama, no network cost)
npx pseolint https://yoursite.com --ai --ai-provider ollama --ai-model qwen2.5:7b

# Enforce a daily spend ceiling across runs (requires telemetry)
npx pseolint https://yoursite.com --ai --telemetry --ai-daily-budget 5.00
```

Every call prints a pre-flight cost estimate before hitting the provider. Cache hits don't count against the daily budget.

### Local telemetry & stats

Telemetry is **local JSONL only**: zero network, counts + spend + feedback ratings. Off by default.

```bash
npx pseolint https://yoursite.com --ai --telemetry
npx pseolint stats              # show your success rate, spend, feedback ratio
npx pseolint stats-export out.jsonl  # copy log for manual inspection
```

## Browser Rendering

For client-rendered sites (React SPAs, Next.js app router), use `--render` to capture the fully rendered DOM:

```bash
# With a remote CDP endpoint (Browserless, etc.)
PSEOLINT_BROWSER_WS=wss://your-browser:3000 npx pseolint https://yoursite.com --render

# With local Playwright
npm install playwright-core
npx playwright install chromium
npx pseolint https://yoursite.com --render
```

Works with any CDP-compatible browser. Remote endpoints must use `wss://`.

## Core Web Vitals

Two sources, both opt-in:

```bash
# Lab: measure LCP + CLS from a headless-Chromium render. Zero external calls.
npx pseolint https://yoursite.com --render

# Field: real-user p75 LCP/CLS/INP from the Chrome UX Report (the numbers Google
# ranks on, and the only source of INP). Free key: https://developer.chrome.com/docs/crux/api
CRUX_API_KEY=... npx pseolint https://yoursite.com          # or --crux-api-key <key>

# Query the mobile field data specifically (Google indexes mobile-first)
CRUX_API_KEY=... npx pseolint https://yoursite.com --crux-form-factor phone
```

Selection is **per-metric**: when a CrUX key is set, `tech/core-web-vitals` uses field
data for each of LCP/CLS/INP and falls back to the lab render for any metric CrUX
lacks, so enabling field data never drops a signal the lab render already had.

CrUX only covers URLs/origins with enough real traffic, so low-traffic pSEO pages get
their **origin-level** field vitals as a fallback. A site-wide origin reading collapses
into **one** finding (not one per page). Per-URL lookups are pooled and capped at 150
(`--crux-max-lookups <n>`, or `0` for unlimited); if the cap forces origin-level
fallback, or CrUX rate-limits (429) / rejects the key (401/403), pseolint says so rather
than silently reporting "no data". The CrUX endpoint is a fixed Google host, so no
external-authority dependency on your own content, consistent with pseolint's
offline-runnable design.

## GitHub Action

```yaml
name: pSEO Lint
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm run build
      - uses: ouranos-labs/pseolint/packages/action@action-v1
        with:
          source: ./out
          threshold: 40
```

Posts a score summary as a PR comment and fails the check if score exceeds the threshold.

## Fix rail: from audit to pull request

The AI orchestrator produces a **fix manifest** (validated patches). `pseolint apply` writes the deterministic ones (meta titles, H1s, `robots.txt`, `sitemap.xml`) straight into your source tree; generative or unmatched patches are demoted to a checklist for a human. `--pr` takes the next step: commit those edits to a tool-owned branch and open a PR.

```bash
# 1. Audit → manifest
pseolint orchestrate https://example.com --max-cost 3 --manifest-out manifest.json

# 2. Apply deterministic edits into your working tree (review the diff, commit yourself)
pseolint apply manifest.json

# 3. …or apply + commit + open a GitHub PR in one step
pseolint apply manifest.json --pr --token "$GITHUB_TOKEN"
```

### Mapping (`.pseolint/templates.json`)

Audited routes don't know your source layout, so you map them once (route pattern → source file). Domain-level patches use the special `robots.txt` / `sitemap.xml` keys:

```json
{
  "/listing/:slug": "app/listing/[slug]/page.tsx",
  "/category/:slug": "app/category/[slug]/page.tsx",
  "robots.txt": "public/robots.txt",
  "sitemap.xml": "app/sitemap.ts"
}
```

Route keys accept `:seg` / `[seg]` / `*` wildcards. A patch with no matching entry (or a literal that can't be found in an interpolated template like `Best in ${city}`) lands in the checklist (or the PR body) instead of silently corrupting source.

### In CI

`apply --pr` uses `git` + one GitHub API call; no extra dependency. Give the workflow write permissions and let `actions/checkout` configure the push token:

```yaml
name: pSEO fix PR
on: { workflow_dispatch: {} }

jobs:
  fix:
    runs-on: ubuntu-latest
    permissions: { contents: write, pull-requests: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm run build
      - run: npx pseolint orchestrate http://localhost:3000 --max-cost 3 --manifest-out manifest.json
        env: { ANTHROPIC_API_KEY: '${{ secrets.ANTHROPIC_API_KEY }}' }
      - run: npx pseolint apply manifest.json --pr
        env: { GITHUB_TOKEN: '${{ github.token }}' }
```

Re-running updates the same `pseolint/fix-<domain>` branch (force-with-lease, tool-owned branch only); it never spams new PRs. It no-ops cleanly when there's nothing deterministic to apply.

## Output Formats

```bash
npx pseolint https://yoursite.com                  # Colored terminal (default)
npx pseolint https://yoursite.com --format json    # CI-friendly JSON
npx pseolint https://yoursite.com --format markdown # PR comments / docs
npx pseolint https://yoursite.com --format html    # Self-contained visual report
```

## Monorepo

| Package | npm | Version | License |
|---------|-----|---------|---------|
| `packages/core` | [`@pseolint/core`](packages/core/README.md) | 0.7.5 | MIT |
| `packages/cli` | [`pseolint`](packages/cli/README.md) | 0.7.3 | MIT |
| `packages/mcp` | [`@pseolint/mcp`](packages/mcp/README.md) | 0.7.4 | MIT |
| `packages/action` | GitHub Action (`ouranos-labs/pseolint/packages/action@action-v1`) | - | MIT |
| `apps/web` | pseolint.dev | - | AGPL-3.0 |

## Development

```bash
bun install
bun run build
bun run test     # 1,203 tests across 126 files (core)
```

## Roadmap

- **AI-inferred template mapping**: today `apply --pr` needs a hand-authored `.pseolint/templates.json`; infer route→source automatically.
- **Closing blind spots**: schema-content drift, outbound-link health, search-intent alignment. Every gap is tracked by impact tier in the [blind-spot audit](./docs/superpowers/specs/2026-05-03-pseolint-blind-spots.md). (Core Web Vitals landed: lab LCP/CLS via `--render`, real-user field p75 + INP via `--crux-api-key`.)
- **Web "Open PR" button**: the fix rail runs from the CLI/Action today; a hosted one-click flow is deferred until the GitHub-App auth is justified.

Found a false positive or a missing check? [Open an issue](https://github.com/ouranos-labs/pseolint/issues). Corpus-backed bug reports move the calibration.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the dev loop, and [`skills/`](skills/README.md) if you want to teach an agent to design pass-first pages. If pseolint saved you a SpamBrain headache, a ⭐ helps others find it.

## License

MIT (packages) / AGPL-3.0 (apps/web)
