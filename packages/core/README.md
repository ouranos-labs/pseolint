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

42 rules across 8 categories. Seven categories feed the composite score; `data/*` is a separate data-binding family.

- **Spam / SpamBrain risk** (8) — near-duplicate (SimHash), entity-swap doorways, thin content, boilerplate ratio, template diversity, template coverage, publication velocity, doorway pattern
- **Technical SEO** (8) — canonical consistency, canonical/noindex and robots/noindex conflicts, sitemap completeness, robots compliance, redirect chains, soft 404s, Open Graph, hreflang
- **AEO / AI Overview citability** (8, v0.3.0) — `llms.txt` presence, AI-crawler access in robots.txt, freshness signals, FAQ coverage, answer-first opener, citable-fact density, non-replicable value, content modularity
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
  state: { path: ".pseolint/state.json", since: true, exitOnRegression: true },
  pageGroups: {
    blog:     { match: "**/blog/**", rules: ["content/*", "spam/*"] },
    products: { match: "**/p/**",    overrides: { "spam/thin-content": { thinContentMinWords: 200 } } },
  },
  dataSource: { records: [{ url: "/p/*", data: { price: "$19", stock: 12 } }] },
  entityPatterns: [{ placeholder: "[CITY]", pattern: "\\b(NYC|LA|SF)\\b", flags: "gi" }],
  ai: { enabled: true, provider: "anthropic", model: "claude-haiku-4-5-20251001", maxCostUsd: 0.1 },
  telemetry: { enabled: true, path: ".pseolint/telemetry.jsonl" },
  rules: {
    nearDuplicateThreshold: 0.85,
    thinContentMinWords: 300,
    titleOverlapThreshold: 0.8,
    // ...
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

### Delta runs & regression gating

Pass `state.since: true` to audit only URLs whose content hash changed since the last run, and `state.exitOnRegression: true` to flag a run where a new rule ID fires on any previously clean URL (`summary.hasRegression`).

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