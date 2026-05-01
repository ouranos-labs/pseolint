# @pseolint/core

> Programmatic SEO audit engine for SpamBrain-risk detection across large template-generated sites.

The core engine behind [pseolint](https://www.npmjs.com/package/pseolint). Use this package to embed pSEO auditing into your own tools, CI pipelines, or SaaS products.

## Install

```bash
npm install @pseolint/core
```

## Usage

```ts
import { auditSource } from "@pseolint/core";

const summary = await auditSource("./out");
console.log(`Score: ${summary.score}/100`);
console.log(`Findings: ${summary.findings.length}`);
```

`auditSource` accepts a local directory, a single HTML file, a page URL, or a sitemap URL.

## What It Checks

32 rules grouped into 4 scoring super-categories (v0.4): **Integrity** (spam + content + cannibal, weight 0.50), **Discoverability** (links + tech, 0.20), **Citation** (aeo + schema, 0.25), **Data** (0.05). Source-tree namespaces remain `spam/*`, `aeo/*`, etc. for stable rule IDs.

- **Spam / SpamBrain risk** (8) — near-duplicate (SimHash), entity-swap doorways, thin content, boilerplate ratio, template diversity, template coverage, publication velocity, doorway pattern
- **Technical SEO** (8) — canonical consistency, canonical/noindex and robots/noindex conflicts, sitemap completeness, robots compliance, redirect chains, soft 404s, Open Graph, hreflang
- **AEO / AI Overview citability** (9, v0.3.0–v0.3.1) — `llms.txt` presence, AI-crawler access in robots.txt, freshness signals, FAQ coverage, answer-first opener, citable-fact density, non-replicable value, content modularity, **summary-bait** (pages optimized for summarization over retention)
- **Content** (5) — unique value, heading / meta uniqueness, author attribution, E-E-A-T signals
- **Internal linking** (5) — orphan pages, dead ends, cluster connectivity, hub pages, link depth
- **Structured data** (3) — JSON-LD validity, required fields, cross-page schema consistency
- **Cannibalization** (3) — title overlap, keyword collision, URL pattern conflicts
- **Data binding** (2) — verify rendered pages expose values from a source dataset (missing or identical-across-pages bindings)

## API

### `auditSource(source, options?)`

Returns an `AuditSummary` with composite score, category scores, enriched findings, and optional cache / state / AI-triage metadata.

Selected options (see `AuditOptions` in `types.ts` for the full surface):

```ts
await auditSource("https://example.com/sitemap.xml", {
  concurrency: 5,
  timeout: 30_000,
  sampleSize: 200,
  samplingStrategy: "stratified",        // or "random"
  ignore: ["**/api/**"],
  maxFetchBytes: 52_428_800,             // 50 MB hard cap per run
  cache: { dir: ".pseolint/cache", ttlMs: 7 * 24 * 60 * 60 * 1000 },
  state: {
    path: ".pseolint/state.json",
    mode: "monitoring",       // v0.5+: pre-fetch decision matrix; "fresh" forces full re-audit.
                              // Omit to auto-monitor when prior state exists.
    ageFloorDays: 7,          // v0.5+: forces refetch on URLs older than N days
    exitOnRegression: true,
    since: true,              // v0.5+ alias for mode: "monitoring" (back-compat)
  },
  pageGroups: {
    blog:     { match: "**/blog/**", rules: ["content/*", "spam/*"] },
    products: { match: "**/p/**",    overrides: { "spam/thin-content": { thinContentMinWords: 200 } } },
  },
  dataSource: { records: [{ url: "/p/*", data: { price: "$19", stock: 12 } }] },
  entityPatterns: [{ placeholder: "[CITY]", pattern: "\\b(NYC|LA|SF)\\b", flags: "gi" }],
  ai: { enabled: true, provider: "anthropic", model: "claude-haiku-4-5-20251001", maxCostUsd: 0.1 },
  telemetry: { enabled: true, path: ".pseolint/telemetry.jsonl" },
  // Safety (v0.3.2–v0.3.3)
  safeMode: "saas",                       // "saas" | "cli" — flips guardSsrf + caps
  guardSsrf: true,                        // DNS-validated SSRF check on every URL
  respectRobotsTxt: true,                 // skip sitemap URLs Disallow'd by target robots.txt
  followRedirects: true,
  maxCrawlDiscovered: 2000,               // hard ceiling on link-discovery fan-out
  signal: controller.signal,              // AbortSignal — ctrl-C / quota-exhausted cancels cleanly
  rules: {
    nearDuplicateThreshold: 0.85,
    thinContentMinWords: 300,
    titleOverlapThreshold: 0.8,
    // ...
  },
});
```

### Safety primitives (SSRF, abort, crawl-ceiling)

`@pseolint/core` ships a few primitives for hosts that run audits against
user-submitted URLs. All are opt-in; local CLI use doesn't change.

```ts
import {
  safeFetch,             // SSRF-safe fetch for non-audit use cases
  validateTargetHost,    // throws SSRFError on private-range / DNS-rebinding targets
  isPrivateOrReservedHost,
  SSRFError,
  DnsResolutionError,
} from "@pseolint/core";

// Validate a user-submitted URL before enqueuing:
await validateTargetHost(new URL(userUrl).hostname);

// Fetch with SSRF guard baked in:
const res = await safeFetch(userUrl, { timeoutMs: 10_000, followRedirects: false });
```

The full audit picks up the same guard via `auditSource(url, { safeMode: "saas" })`
or via the individual `guardSsrf` / `respectRobotsTxt` / `followRedirects` flags.

### Render-mode analytics blocking

Rendered audits (`options.render = {...}`) block known analytics endpoints
by default so the audit doesn't inject fake sessions into the site owner's
GA / Plausible / PostHog / Mixpanel / Hotjar / Sentry dashboards.

```ts
await auditSource(url, {
  render: {
    analyticsMode: "block",               // default — blocks ~40 analytics hosts
    // "allow-first-party" — block third-party only
    // "allow" — don't intercept anything
    extraBlockedHosts: ["my-internal-metrics.corp"],
  },
});
```

### Formatters

```ts
import { formatConsole, formatJson, formatMarkdown, formatHtml } from "@pseolint/core";

const out = formatConsole(summary);
const json = formatJson(summary);
const md   = formatMarkdown(summary);
const html = formatHtml(summary);
```

### AI triage

When `ai.enabled` is set, findings are clustered into root-causes by an LLM. Providers are loaded lazily from optional peer deps — install only the one you need:

```bash
npm install @ai-sdk/anthropic   # or @ai-sdk/openai, @ai-sdk/google, @ai-sdk/mistral,
                                #    @ai-sdk/groq, @ai-sdk/xai, @ai-sdk/cohere,
                                #    ollama-ai-provider-v2
```

```ts
import { triageFindings, createLanguageModel, estimateCostUsd } from "@pseolint/core";
```

Cost and daily-budget caps are enforced pre-flight; results are cached on disk by default.

### Change-driven monitoring (v0.5)

When prior state exists, `auditSource` defaults to **monitoring mode**: the decision matrix decides which URLs to fetch BEFORE the network round-trip. URLs without change signals are skipped entirely; their findings are carried forward from prior state with `carriedForward: true` and `lastVerifiedAt` markers.

```ts
import { planScrapeStrategy, CORE_RULESET_VERSION, DEFAULT_AGE_FLOOR_DAYS } from "@pseolint/core";

// The decision matrix is also exposed as a pure function for callers that
// want to plan their own fetches:
const plan = planScrapeStrategy({
  candidateUrls,
  priorState,
  sitemapLastmodByUrl,        // Map<url, ISO-string>
  currentRulesetVersion: CORE_RULESET_VERSION,
  ageFloorDays: DEFAULT_AGE_FLOOR_DAYS,
  now: new Date(),
  // Optional Pro-only inputs:
  // gscDeltasByUrl, gscThresholds
});
// plan.refetch: Map<url, RefetchReason>
// plan.skip:    Map<url, "unchanged">
```

**Reasons** (first match wins): `new` → `age` → `ruleset` → `recheck` (warning/error/critical only — info findings carry forward) → `lastmod` → `gsc` → `no-signal` → else `unchanged`.

`AuditSummary.scrapePlan` reports `{ fetched, intended, carriedForward, reasonCounts, rulesetVersion, lastFullAuditAt }` — populated only on monitoring runs.

**Bump `CORE_RULESET_VERSION`** when shipping a new rule or materially changing rule logic so monitoring runs re-evaluate previously-skipped URLs against the new ruleset.

**Regression gating.** `state.exitOnRegression: true` flags a run where a new rule ID fires on any previously clean URL (`summary.hasRegression`). Carried-forward findings are excluded from the regression baseline so a regression on a skipped URL isn't masked by stale findings.

### State schema v2

`UrlStateEntry` v2 stores full finding records (not just IDs) so future runs can carry them forward. Persists `lastModified`, `etag`, `sitemapLastmodAtAudit`, `rulesetVersion` per URL. `RunState` adds `lastFullAuditAt` and `rulesetVersion`. Existing v1 state files (v0.4) are discarded on read with a warning, triggering one baseline re-audit.

### Caching

Setting `cache` enables an ETag/Last-Modified-aware disk cache for HTTP fetches. `summary.cacheStats` reports `{ hits, total, bytesSavedEstimate }`.

### Page groups

Classify pages by glob and apply different rule subsets or threshold overrides per group. Results are surfaced in `summary.groupScores` / `summary.groupPageCounts`.

### Rendering

For client-rendered pages, install `playwright-core` and pass `render: { browserWsEndpoint }` to connect to an existing browser endpoint.

## Peer dependencies

All AI providers and `playwright-core` are optional peers — you only install the ones you actually use.

## License

MIT