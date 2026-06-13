# @pseolint/core

> Programmatic SEO audit engine — 44 rules, surfaced per-template, on every monitored release.

The core engine behind [pseolint](https://www.npmjs.com/package/pseolint) v0.7.0. Use this package to embed pSEO auditing into your own tools, CI pipelines, or SaaS products.

## Install

```bash
npm install @pseolint/core
```

## Usage

```ts
import { auditSource } from "@pseolint/core";

const result = await auditSource("https://example.com");
console.log(`Verdict: ${result.verdict}`);
console.log(`Findings: ${result.findings.length}`);

// v0.6: per-template breakdown
for (const t of result.templates) {
  console.log(`${t.signature}  ${t.verdict}  risk=${t.risk}`);
  if (t.variance.topDriver) {
    const { ruleId, fireRate } = t.variance.topDriver;
    const n = Math.round(fireRate * t.auditedUrls.length);
    console.log(`  ${n}/${t.auditedUrls.length} samples fail ${ruleId}`);
  }
}
```

`auditSource` accepts a local directory, a single HTML file, a page URL, or a sitemap URL.

## What It Checks

44 rules grouped into 4 scoring super-categories (v0.4): **Integrity** (spam + content + cannibal, weight 0.50), **Discoverability** (links + tech, 0.20), **Citation** (aeo + schema, 0.25), **Data** (0.05). Source-tree namespaces remain `spam/*`, `aeo/*`, etc. for stable rule IDs.

- **Spam / SpamBrain risk** (8) — near-duplicate (SimHash), entity-swap doorways, thin content, boilerplate ratio, template diversity, template coverage, publication velocity, doorway pattern (cluster-collapsed since v0.5.2)
- **Technical SEO** (9) — canonical consistency, canonical/noindex and robots/noindex conflicts, sitemap completeness, robots compliance, redirect chains, soft 404s, hreflang reciprocity, robots-sitemap presence, **og-completeness** (v0.5.2)
- **AEO / AI Overview citability** (8, v0.3.0–v0.3.1) — `llms.txt` presence, AI-crawler access in robots.txt, freshness signals, FAQ coverage, answer-first opener, citable-fact density, content modularity, **summary-bait** (pages optimized for summarization over retention)
- **Content** (7) — unique value, meta uniqueness, author attribution, E-E-A-T signals, plus **title-uniqueness**, **heading-structure**, **image-alt-text** (all v0.5.2)
- **Internal linking** (6) — orphan pages, dead ends, cluster connectivity, link depth, unreachable-from-root (sample-aware), **host-section-divergence** (v0.5.1, site-reputation-abuse detector)
- **Structured data** (3) — JSON-LD validity, required fields, cross-page schema consistency
- **Cannibalization** (1) — URL pattern conflicts (`title-overlap` and `keyword-collision` were dropped in v0.4 due to high false-positive rates)
- **Data binding** (2) — verify rendered pages expose values from a source dataset (missing or identical-across-pages bindings)

## What's new in v0.6 — audit-as-template

The unit of analysis is now the **template**, not the URL. When ≥2 template clusters are detected (each with ≥1% URL coverage and ≥5 pages), the engine runs a two-phase pipeline:

1. **Template detection** — clusters the sitemap via `clusterUrlTemplates`, canonicality-verifies one sample per cluster. Cost: ~T HTTP fetches.
2. **Per-template deep audit** — stratified-samples K pages per template (K=10 monitoring, K=20 re-audit), runs all per-page rules, tags each `RuleResult` with its `template` field, computes per-template verdict + variance.

`AuditResult.templates` is additive — old code reading `findings` continues to work.

### `Template` type

```ts
import type { Template, TemplateVariance, AuditResult } from "@pseolint/core";

// Each entry in result.templates:
// {
//   signature: string;          e.g. "/listing/:slug"
//   totalUrls: number;          cluster size in the sitemap
//   auditedUrls: string[];      pages actually fetched in phase 2
//   verdict: Verdict;
//   risk: number;               0-100, independent of site-level risk
//   categories: CategoryGrades;
//   variance: {
//     ruleFireRates: Record<string, number>;  per-rule fraction of samples that fired
//     uniformityScore: number;                0-1; high = same problems on every page
//     topDriver: { ruleId: string; fireRate: number } | null;
//   };
//   findingIds: string[];       references into result.findings
// }
```

### `siteVerdictFromTemplates` helper

```ts
import { siteVerdictFromTemplates } from "@pseolint/core";

// Returns the worst verdict among templates with ≥5% URL coverage.
// Falls back to "ready" when no template clears the 5% floor.
const verdict = siteVerdictFromTemplates(result.templates);
```

### Full example — audit a site, log per-template verdicts

```ts
import { auditSource } from "@pseolint/core";

const result = await auditSource("https://example.com", {
  samplingStrategy: "stratified",
  cache: { dir: ".pseolint/cache" },
});

console.log(`Site verdict: ${result.verdict}  risk: ${result.risk}`);

for (const t of result.templates) {
  const td = t.variance.topDriver;
  const driverLine = td
    ? `  top driver: ${td.ruleId} (${Math.round(td.fireRate * 100)}% of samples)`
    : "";
  console.log(`  ${t.signature}  ${t.verdict}  uniformity ${Math.round(t.variance.uniformityScore * 100)}%${driverLine}`);
}
```

Design rationale: [`docs/superpowers/specs/2026-05-04-pseolint-v0.6-audit-as-template-reframe.md`](../../docs/superpowers/specs/2026-05-04-pseolint-v0.6-audit-as-template-reframe.md)

## What's new in v0.5.2 — credibility layer

- **4 new content-quality rules** addressing the v0.5.1 blind-spot audit's tier-1 gaps: `content/title-uniqueness` (raw, not entity-masked — catalog templates with per-record entity values still pass), `content/heading-structure` (H1 presence, single-H1, hierarchy), `content/image-alt-text` (skips `role="presentation"` / `aria-hidden="true"` / explicit `alt=""`), `tech/og-completeness` (the README-promised rule that finally ships).
- **`AuditOptions.authorityScore`** (0-100) — bring-your-own-DA. ≥80 shifts the verdict ladder one tier lenient (established brand can absorb shapes a newer site can't). ≤30 shifts one tier stricter (newer/lower-authority operator). Raw `risk` number unchanged so CI gates stay stable. The engine itself remains authority-blind by design — no Moz/Ahrefs/Semrush dependency.
- **`AuditOptions.sampleSeed`** — deterministic `mulberry32` PRNG plumbed through the stratified sampler. Repeated audits with the same seed pick the same pages and produce reproducible verdicts.
- **`spam/doorway-pattern` cluster collapse** — emits in the same `pageUrl` + `relatedUrls[0]` shape as `spam/near-duplicate` and is registered in `CLUSTERABLE_RULES`. C(N,2) per-pair findings on entity-swap-heavy catalogs collapse into one cluster finding per template-tied group.
- **Per-bucket info-severity cap** — a flood of info findings can't fill a category bucket on its own (capped at 50 separately from the 100 cap on warning+ findings).
- **`summary.appliedSeverityDemotions: string[]`** — engine emits the list of rule IDs whose severity was overridden by the active scoring profile so consumers (formatters, CI) can show *which* rules got demoted and *why*. Pass `--strict` to disable demotions entirely.
- **Sample-aware rules** — `links/unreachable-from-root` skips on partial-sample audits (it can't distinguish real graph isolation from sample-shape).
- **Markdown formatter** collapses informational findings under `<details>` so PR comments don't drown actionable items in 100+ info bullets.

The full per-round iteration story (9 calibration rounds against a curated reputable-pSEO corpus) and the trade-offs we accepted are at [`docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md`](../../docs/superpowers/specs/2026-05-03-calibration-against-reputable-pseo.md). The honest blind-spot audit (what we still don't detect, including the domain-authority gap that motivated `--authority-score`) is at [`docs/superpowers/specs/2026-05-03-pseolint-blind-spots.md`](../../docs/superpowers/specs/2026-05-03-pseolint-blind-spots.md). The dated user-facing methodology summary is at [pseolint.dev/methodology](https://pseolint.dev/methodology).

## API

### `auditSource(source, options?)`

Returns an `AuditResult` with verdict, risk score, category grades, enriched findings, and — since v0.6 — a `templates: Template[]` array with per-template verdicts and variance metrics. Also carries optional cache / state / AI-triage metadata.

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

## JSON output contract

`formatJson(summary)` (and `pseolint --format json`) serializes the `AuditSummary` shape verbatim. This is the surface CI gates and other programmatic consumers (pseolint-gate-style scripts) should read. A machine-readable **JSON Schema (draft 2020-12)** is published with the package at [`schemas/audit-summary.schema.json`](./schemas/audit-summary.schema.json) — validate against it instead of hand-rolling shape assumptions.

### `schemaVersion` — read it, branch on it

```jsonc
{
  "schemaVersion": "2026-06-v0.6",  // bumps on EVERY breaking OR additive-public output change
  "verdict": "caution",             // "ready" | "caution" | "concerning" | "critical"
  "risk": 42,                       // 0-100, lower = better. Never shown to humans; use for CI thresholds.
  "headline": "3 ship-blockers, 16 should-fix",
  "categories": { /* 5 fixed keys → { grade, issues } */ },
  "issues":     { /* severity buckets — see below */ },
  "templates":  [ /* v0.6 per-template breakdown; may be [] or absent */ ],
  "pageCount":  150
  // ... diagnostics, auditedUrls, truncated, etc.
}
```

The `schemaVersion` string carries a `YYYY-MM-vX.Y` tag (matching the `$id` of the published schema). **It bumps whenever the output shape changes** — breaking *or* additive. Gate scripts should assert the version they were written against (or accept a known range) so a shape change surfaces as a clear failure rather than silent misread.

### `issues` is SEVERITY-bucketed (not a flat array, not category-keyed)

This is the most common thing consumers get wrong:

```jsonc
"issues": {
  "blockers":      [ /* RuleResult — severity error | critical */ ],
  "shouldFix":     [ /* RuleResult — severity warning */ ],
  "informational": [ /* RuleResult — severity info */ ]
}
```

It is **not** `issues: RuleResult[]` and **not** `issues: { aeo: [...], spam: [...] }`. To get a single flat list for a gate:

```ts
const all = [...summary.issues.blockers, ...summary.issues.shouldFix, ...summary.issues.informational];
const shouldFail = summary.issues.blockers.length > 0; // typical gate
```

`categories` (keyed by `integrity` | `discoverability` | `citation` | `data` | `audit`) carries **grades + counts only** — the per-category issue arrays live under `issues`, bucketed by severity, not under `categories`.

### `truncated: true` means partial coverage

When the crawl did not complete (e.g. the backpressure watchdog aborted on a degraded origin), the report sets `truncated: true` and a human-readable `truncatedReason`. The report still carries whatever findings were collected, but **CI gates MUST treat `pageCount`, `risk`, `verdict`, and all counts as LOWER bounds** — a "ready" verdict on a truncated run does not mean the site is clean, only that nothing was found before the abort. Gate on `truncated` explicitly if a partial pass should not count as a pass.

### Validating in your own pipeline

```ts
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "@pseolint/core/schemas/audit-summary.schema.json" with { type: "json" };

const ajv = new Ajv2020({ strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const report = JSON.parse(stdout);           // pseolint --format json
if (!validate(report)) throw new Error(ajv.errorsText(validate.errors));
```

The schema's `additionalProperties` is permissive, so it pins the contract consumers gate on without rejecting forward-compatible field additions.

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

### AI orchestrator (v0.5)

Net-new in v0.5. `orchestrate()` drives an LLM through 25 deterministic tools (sitemap fetch, template clustering, per-page rule checks, AEO probes against live answer engines, SerpAPI) and produces a **fix manifest** of concrete patches — not just a list of findings.

```ts
import { orchestrate } from "@pseolint/core";

const { session, manifest, validation, diff } = await orchestrate({
  domain: "https://example.com",
  userId: "demo",
  budget: { maxSessionUsd: 3 },         // optional; default $5
  onEvent: (e) => console.log(e),       // optional; SSE-friendly callback
});

if (session.reason === "completed") {
  console.log(`Verdict: ${manifest!.verdict}`);
  console.log(`${validation!.validPatches}/${validation!.totalPatches} patches valid`);
}
```

**What you get:**
- `manifest` — `FixManifest` with verdict, category grades, page/template/domain patches (replace_h1, rewrite_meta, add_jsonld, add_faq_block, rewrite_intro, add_internal_link, remove_thin_block, robots_txt, sitemap_xml, canonical_strategy)
- `validation` — patch-by-patch `ManifestValidationReport`. Failed patches are dropped from the manifest before it returns; `failures` carries the location + reason.
- `diff` — `ManifestDiff` of structured `PatchDiff` objects (5 kinds — text_replace, html_insert, html_remove, file_replace, guidance) suitable for direct UI rendering.

**Architecture**: rules become tools the LLM calls. The LLM picks order. Budget caps (LLM tokens + external probe USD, pre-flight + reactive) bound spend. Watchdog injects a convergence reminder every N tool calls. AsyncLocalStorage-backed page cache means HTML never travels in conversation history — token cost stays bounded as audits scale.

**Lower-level exports** for callers who want individual pieces:

```ts
import {
  runOrchestrator,           // direct runner — bring your own LanguageModel
  orchestratorTools,         // the 25-tool registry
  defineTool,                // helper to add custom tools
  validateManifest,          // walk a manifest, return per-failure report
  diffManifest,              // produce a structured-diff projection
  manifestSchema,            // Zod schema for FixManifest
  buildSystemPrompt,         // canonical orchestrator system prompt
  DEFAULT_BUDGET,            // BudgetCaps defaults
} from "@pseolint/core";
```

External probes (`query_serp`, `ask_ai_engine`) read API keys from the call's `apiKey` arg or `SERPAPI_API_KEY` / `ANTHROPIC_API_KEY` / `PERPLEXITY_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` env vars.

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