# pseolint

> Find the broken template before SpamBrain does.

The CLI for **programmatic SEO auditing** — v0.7.0. Detects SpamBrain-risk patterns across large template-generated sites, now surfaced per-template instead of as a flat findings list.

## What's new in v0.6 — audit-as-template

- **Per-template verdict aggregation** — the worst template with ≥5% URL coverage drives the site headline. One broken `/listing/:slug` can't hide behind a clean `/category/:slug`.
- **Per-template variance metric** — uniformity score + top-driver rule per template. "8/10 samples fail `spam/thin-content`" is printed directly on the template card.
- **Two-phase pipeline** — phase 1 clusters the sitemap (~T fetches); phase 2 deep-audits K pages per template. Typical budget: ~80 fetches on a 100k-URL site vs. 200 in v0.5.
- **`--per-template`** (default ON) — renders template cards above the findings list.
- **`--template <signature>`** — drill into one template's findings, useful in CI.
- **`--legacy-flat`** — opt out; get the v0.5-style flat list.
- **Backwards compatible** — `--format json` still includes `findings`; `templates` is additive.

Design rationale: [`docs/superpowers/specs/2026-05-04-pseolint-v0.6-audit-as-template-reframe.md`](../../docs/superpowers/specs/2026-05-04-pseolint-v0.6-audit-as-template-reframe.md)

## What's new in v0.5.2 — credibility layer

- **4 new content-quality rules** addressing the blind-spot audit's tier-1 gaps: `content/title-uniqueness` (catches actually-duplicate titles — raw, not entity-masked, so catalog templates with per-record entity values still pass), `content/heading-structure` (H1 presence, single-H1, hierarchy), `content/image-alt-text` (skips decorative images marked `role="presentation"` / `aria-hidden="true"` / `alt=""`), `tech/og-completeness` (the long-promised OG-tag rule that finally ships).
- **`--authority-score N`** (0-100) — bring-your-own domain authority. `>= 80` shifts the verdict one tier lenient (established brand can absorb shapes a newer site can't). `<= 30` shifts one tier stricter. Raw `risk` number unchanged so CI gates that key off `--ci-threshold` stay stable. The engine itself remains authority-blind by design — no Moz/Ahrefs/Semrush dependency.
- **`--sample-seed N`** — deterministic stratified sampling. Same seed = same audit = same verdict, run after run. CI gates and calibration runs get reproducible results instead of bouncing across the verdict-ladder boundary.
- **`spam/doorway-pattern` cluster collapse** — entity-swap-heavy catalogs no longer produce hundreds of per-pair findings; they collapse into one cluster line per template-tied group.
- **Per-bucket info-severity cap** — info findings can't accumulate to tank a verdict on their own (capped at 50 per category bucket separately from the 100 cap on warning+).
- **Console formatter** shows `Demoted N rules (X, Y, Z) — <site type> profile; pass --strict to disable` so the engine's reasoning is visible. Markdown formatter collapses info findings under `<details>` so PR comments stay actionable.
- **Calibrated against reputable in-production pSEO sites.** The full 9-round iteration story (with trade-offs honestly documented) and the blind-spot audit (what we still don't detect) live at [pseolint.dev/methodology](https://pseolint.dev/methodology).

## What's new in v0.5

**AI orchestrator (`pseolint orchestrate <domain>`).** Drives an LLM through 25 deterministic tools and produces a **fix manifest** with concrete copy-paste patches (rewritten H1s, JSON-LD blocks, robots.txt diffs, internal-link suggestions). Every patch passes a deterministic schema validator before reaching the manifest — the LLM can't ship a malformed JSON-LD block or unsafe HTML.

```bash
export ANTHROPIC_API_KEY=sk-...
pseolint orchestrate https://example.com \
  --max-cost 3 \
  --manifest-out manifest.json
```

Live event stream to stdout, three exit codes (0 clean / 1 didn't finish / 2 some patches dropped). See `pseolint orchestrate --help` for full options.

**Change-driven monitoring** also ships in v0.5. When prior state exists, the auditor decides which URLs to fetch *before* the network round-trip using a 7-reason matrix (new / age / ruleset / recheck / lastmod / GSC / no-signal). Sites with reliable sitemap `<lastmod>` (Next.js, WordPress/Yoast, Astro) typically see ~95% fewer fetches on steady-state monitoring runs. `--since` is an alias for `--mode=monitoring`. New: `--mode=monitoring|fresh` and `--age-floor-days=N`. State schema bumped to v2 (existing `.pseolint/state.json` files trigger one baseline re-audit). See `docs/superpowers/specs/2026-05-01-change-driven-monitoring-design.md`.

## What's new in v0.4

v0.4 reshapes the audit output around a single **verdict** (`ready` / `caution` / `concerning` / `critical`) plus four category grades (`Integrity`, `Discoverability`, `Citation`, `Data`). The old numeric "SpamBrain Risk Score" is no longer the headline — it remains internally as `risk` for CI threshold tuning, trends, and alert gates, but operators ship on verdict, not on a number that needs a translation table.

By default the console output prints the verdict, four grades, and the top 3 fixes. Use `--explain` for the full bucketed list. CI gates use verdict severity (`--ci-threshold`) instead of a numeric risk threshold; the legacy `--threshold` flag is deprecated for one release.

See `docs/superpowers/specs/2026-04-29-pseolint-v0.4-engine-redesign.md` for the full design rationale.

## Install

```bash
npx pseolint http://localhost:3000
```

Or install globally:

```bash
npm install -g pseolint
```

## Usage

```bash
# Audit your local dev server (recommended)
npx pseolint http://localhost:3000

# Audit a live site — per-template output is the default in v0.6
npx pseolint https://yoursite.com

# Audit a build directory
npx pseolint ./out --ci-threshold concerning

# Filter output to a single template (useful in CI)
npx pseolint https://yoursite.com --template "/listing/:slug"

# Suppress template cards; get the v0.5-style flat findings list
npx pseolint https://yoursite.com --legacy-flat

# Show every finding (default view shows verdict + grades + template cards + top 3 fixes)
npx pseolint http://localhost:3000 --explain

# Diff two audit runs (verdict, grades, fixed/regressed/new findings)
npx pseolint diff baseline.json current.json

# Save an HTML report
npx pseolint http://localhost:3000 --format html --output report.html
```

A typical v0.6 console output looks like:

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

3 blockers, 16 warnings — top fixes by impact:
  1. /listing/* thin content (8/10 pages)        → add 200+ unique words per page
     pseolint.dev/rules/thin-content
  2. /help/* missing author attribution (3 pages) → add author schema or byline
     pseolint.dev/rules/missing-author
  3. /listing/* missing og:image (10 pages)      → add to listing layout
     pseolint.dev/rules/og-completeness

Run `pseolint --explain` for the full list.
```

## Options

```
-f, --format <type>       console, json, markdown, html (default: "console")
--ci-threshold <severity> Verdict severity that fails CI: ready | caution |
                          concerning | critical (default: concerning).
                          Exit non-zero if the audit's verdict is at or worse
                          than the threshold.
--explain                 Print every finding, bucketed by severity (blockers /
                          should-fix / informational). Default view is the
                          compact verdict + grades + template cards + top-3-fixes.
-o, --output <file>       Write report to file
--no-color                Disable colored output
--concurrency <n>         Max parallel HTTP fetches (default: 5)
--timeout <ms>            Per-request timeout (default: 30000)
--sample-size <n>         Audit a random subset of N pages
--ignore <patterns>       Comma-separated glob patterns to exclude
--render                  Render pages in a browser before auditing
--browser-ws <url>        CDP WebSocket endpoint for rendering
--no-crawl                Disable crawl-based page discovery

Template output (v0.6)
--per-template            Render per-template cards (default: ON when ≥2 templates
                          detected; suppress with --legacy-flat)
--template <signature>    Filter output to a single template, e.g. /listing/:slug.
                          CI use case: fail only when that template degrades.
--legacy-flat             Suppress template cards; print the v0.5-style flat
                          findings list.

Safety (v0.3.2+)
--safe-mode <saas|cli>    Preset: "saas" flips guardSsrf + tightens caps;
                          "cli" keeps local-friendly defaults.
--no-respect-robots       Audit sitemap URLs even if robots.txt Disallow's
                          them (use when auditing your own staging site).
--no-follow-redirects     Return 3xx as-is — report the redirect instead
                          of following it.

Render-mode analytics (v0.3.1+)
--analytics <mode>        block (default) | allow-first-party | allow.
                          Prevents the audit from injecting fake sessions
                          into the site owner's GA/Plausible/etc.
--block-host <host>       Extra host substring to block (repeatable).
```

## Subcommands

```
pseolint diff <baseline> <current>   Diff two AuditSummary JSON reports.
                                     Shows verdict + grade deltas, fixed,
                                     regressed, and new findings.
                                     Exits non-zero if there are new
                                     blockers since baseline.

pseolint stats                       Aggregate local telemetry.
pseolint stats-export <out>          Copy telemetry JSONL for sharing.
pseolint cache stats|prune|clear     Manage the HTTP fetch cache.
pseolint upload <report>             Push a JSON report to pseolint Pro.
```

Press `ctrl-C` during an audit to cancel cleanly — in-flight fetches abort,
partial results are discarded. A second `ctrl-C` within ~1 s forces exit.

## Configuration

Create `pseolint.config.ts` in your project root:

```typescript
export default {
  rules: {
    nearDuplicateThreshold: 0.85,
    thinContentMinWords: 500,
  },
  pageGroups: {
    templates: {
      match: '/templates/**',
      rules: ['spam/*', 'content/*'],
    },
  },
  ignore: ['/api/**', '/admin/**'],
};
```

## Caching and delta audits

### HTTP cache

Speed up re-runs and cut egress by caching fetches:

```bash
pseolint https://example.com --cache
pseolint https://example.com --cache --cache-ttl 30d
```

Cached entries honor `ETag` / `Last-Modified` for 304 revalidation. When servers strip these headers, entries fall back to TTL-based freshness (default 7 days). Negative responses (4xx) are cached for 24h; 5xx are never cached. Redirects are stored as pointer entries so re-runs resolve without a network round-trip.

The cache is capped at **200 MB by default** (override with `--cache-max-mb`, `0` = unlimited). After each run, oldest-mtime entries are evicted until under the cap. This keeps large pSEO sites (5k+ URLs) from filling the disk — a single uncapped crawl of a 5k-page site can reach ~1.5 GB. Manage the cache explicitly:

```bash
pseolint cache stats                 # size + file count
pseolint cache prune --max-mb 500    # evict down to 500 MB
pseolint cache clear                 # delete everything
```

On the first run in a git repo, the CLI appends `.pseolint/` to the repo's root `.gitignore` (opt-out: `--no-gitignore`) so you don't accidentally commit the cache. It never creates a `.gitignore` file from scratch.

### Auditing a localhost dev server

Crawling `http://localhost:3000` is valid, but watch the blast radius: every fetched page hits your dev server, which typically re-queries your database on every request (Next.js dev doesn't cache like production). On pSEO sites this means a full 5k-page crawl → 5k × (queries per page) = bursty database egress. If your dev server points at production or a metered DB (e.g. Supabase on a free tier), a single careless run can exhaust the egress quota. Mitigations:

- Use `--sample-size 50` while iterating on rules; run the full crawl only before releases.
- Point your local dev server at a disposable DB, not production.
- Keep `--cache` on so re-runs read cached entries instead of re-hitting the dev server.

### Auditing a live production site

pseolint is a polite crawler by default — it sets a distinct `User-Agent`, respects `robots.txt`, and honors `Crawl-delay`. But on large pSEO sites (thousands of URLs) the origin's cache strategy is what determines whether a full audit is free or painful. Before running against production:

1. **Confirm edge caching.** `curl -I https://yoursite.com/<one-pseo-url>` on a warm URL should show `x-vercel-cache: HIT` / `cf-cache-status: HIT` / similar. If every request hits your origin and DB, a 5k-URL crawl is 5k DB round-trips.
2. **Add `Crawl-delay: 1` to `robots.txt`.** pseolint forces concurrency to 1 and sleeps between requests when it sees this — effectively a hard rate limit that any polite crawler will follow.
3. **Canary first.** Run `pseolint https://yoursite.com --sample-size 20 --concurrency 2` and watch DB metrics (active connections, query p95) for 30 seconds. If anything spikes, fix caching before the full run.
4. **Start conservative.** `--concurrency 2 --safe-mode saas` for the first full audit; raise only after you've confirmed cache-hit ratio.
5. **Allowlist the User-Agent.** If your WAF/Cloudflare rate-limits bots, whitelist `pseolint/*` or the IP you're running from — otherwise mid-crawl 429s will corrupt the report.

If pSEO pages return CDN-cached responses for normal GET requests, the audit costs you effectively zero DB load regardless of page count.

### Run state + change-driven monitoring (v0.5)

Persist audit state across runs and let pseolint decide which URLs to refetch:

```bash
# First run (writes baseline state)
pseolint https://example.com --state

# Subsequent runs auto-enter monitoring mode — no flag required.
# The pre-fetch decision matrix skips URLs without change signals.
pseolint https://example.com --state

# Force a full re-audit even with prior state
pseolint https://example.com --state --mode=fresh

# Tighten the age floor (default: 7 days). URLs older than this re-fetch regardless.
pseolint https://example.com --state --age-floor-days=3

# CI gate that fails when a *new* rule ID starts firing on actually-fetched URLs
pseolint https://example.com --state --exit-on-regression

# Back-compat: --since still works (alias for --mode=monitoring)
pseolint https://example.com --state --since
```

**Decision matrix.** For each URL in the candidate set, the first matching reason wins:

| Reason | Trigger |
|---|---|
| `new` | URL not in prior state |
| `age` | Prior fetch older than `--age-floor-days` (default 7) |
| `ruleset` | `CORE_RULESET_VERSION` changed since last run |
| `recheck` | Prior `error`/`critical`/`warning` finding (info-only carries forward) |
| `lastmod` | Sitemap `<lastmod>` newer than prior fetch |
| `gsc` | GSC delta crosses threshold (Pro / when wired) |
| `no-signal` | No sitemap-lastmod and no GSC for this URL |
| `unchanged` | None of the above — **skip the fetch**, carry findings forward |

End-of-run summary line:
```
Monitoring: 47/4012 URLs re-scraped (recheck=23, lastmod=12, age=8, new=4), 3965 carried forward.
```

State is stored at `.pseolint/state.json` by default. Commit it to share baseline across CI workers. State schema v2 (v0.5+); upgrading from v0.4 discards the old file with a warning and triggers one baseline re-audit. Switching between `--render` modes also invalidates prior state.

**Savings depend on sitemap hygiene.** Sites whose sitemaps emit `<lastmod>` (Next.js, WordPress/Yoast, Astro) get up to ~95% fetch reduction on steady-state monitoring runs. Sites without `<lastmod>` hit `no-signal` and refetch every URL — bandwidth is still saved via cache.ts conditional GETs but round-trips aren't skipped (a HEAD-fallback path is on the roadmap).

### Stratified sampling

When `--sample-size` is set, samples are drawn proportional to `sqrt(cluster_size)` per inferred URL template, ensuring every template is represented instead of biasing toward large clusters:

```bash
pseolint https://example.com --sample-size 200 --strategy stratified --max-per-template 20
```

Use `--strategy random` to fall back to uniform Fisher-Yates sampling.

### Static site: zero egress

If your site outputs static HTML (`out/`, `dist/`, `public/`, `_site/`), audit the directory directly — no HTTP fetches at all:

```bash
pseolint ./out
```

## AI triage

Turn long findings lists into ranked root causes. Opt-in; off by default.

### Supported providers

| Provider | SDK package                    | Env var                            |
|----------|--------------------------------|------------------------------------|
| anthropic | @ai-sdk/anthropic (pre-installed) | ANTHROPIC_API_KEY                |
| openai    | @ai-sdk/openai                 | OPENAI_API_KEY                     |
| google    | @ai-sdk/google                 | GOOGLE_GENERATIVE_AI_API_KEY       |
| mistral   | @ai-sdk/mistral                | MISTRAL_API_KEY                    |
| groq      | @ai-sdk/groq                   | GROQ_API_KEY                       |
| xai       | @ai-sdk/xai                    | XAI_API_KEY                        |
| cohere    | @ai-sdk/cohere                 | COHERE_API_KEY                     |
| ollama    | ollama-ai-provider-v2 (pre-installed) | — (local, no key)            |

Install only the providers you use: `npm install @ai-sdk/openai`.

### Quick start

```bash
# Auto-detect from env vars
export ANTHROPIC_API_KEY=sk-ant-...
pseolint ./out --ai

# Pick explicitly
pseolint ./out --ai --ai-provider openai --ai-model gpt-4o-mini

# Local + private
ollama serve &
pseolint ./out --ai --ai-provider ollama --ai-model llama3.1:8b
```

### Flags

```
--ai                          Enable AI triage
--ai-provider <id>            Provider (see table above)
--ai-model <name>             Override default model for the chosen provider
--ai-endpoint <url>           Ollama endpoint (default http://localhost:11434)
--ai-max-tokens <n>           Input token cap (default 60000)
--ai-max-cost <usd>           Refuse a call whose pre-flight cost exceeds this USD
--ai-daily-budget <usd>       Refuse triage when today's total spend would exceed this USD
--ai-cache-ttl <duration>     Triage cache TTL (default 30d)
--no-ai-cache                 Bypass cache
--no-ai-suggest               Suppress discovery hint
```

### How it works

After the linter runs, the AI step takes the enriched findings (capped at 200 by severity) and asks the model to identify 1–5 underlying root causes ranked by SEO impact. The findings list is unchanged — triage is an *additional* section above it.

### Model reliability

Triage uses structured-output generation (JSON matching a strict schema). Not every model handles this reliably at real-world audit sizes.

**Recommended (validated):** `claude-sonnet-4-6`, `claude-opus-4-7`, `gpt-4o`, `gemini-2.5-pro`.
**Works but marginal:** `gpt-4o-mini`, `gemini-2.5-flash` — cheaper, sometimes truncate.
**Avoid for triage:** `claude-haiku-4-5-20251001` and similar small models — fails schema validation in our smoke tests (~30 findings). If you want cheap, prefer `gpt-4o-mini` or `gemini-2.5-flash`.

If your chosen model fails, you'll see `[ai-triage] skipped: ...` on stderr and the audit completes normally. Check `pseolint stats` for skip-reason counters.

### Cost and budget

- Triage runs as **one** model call per audit. Default input cap: 60k tokens.
- A pre-flight line is printed before every call: `[ai-triage] calling anthropic:claude-sonnet-4-6 — ~12,000 input / ≤4,000 output tokens, ~$0.12`. You can Ctrl-C before the call lands.
- **Per-call cap:** `--ai-max-cost 0.50` refuses the call if the pre-flight estimate exceeds $0.50. Recommended for any CI use.
- **Daily budget:** `--ai-max-cost 0.50 --ai-daily-budget 5.00 --telemetry` reads today's successful-triage spend from your local telemetry JSONL and refuses the call when the running total would breach the budget. **"Today" is a UTC calendar day** — the counter rolls over at `00:00 UTC`, which is a fixed offset from your local midnight. Cache hits are excluded from the running total (no real API call, no real spend).
- Results are cached at `.pseolint/ai-cache/` for 30 days. Re-running on unchanged audit data is free.
- Cache key includes the prompt version — bumping it auto-invalidates the cache.
- **Do not put `apiKey` in a committed config file.** Use the provider's env var (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.). A warning is printed if `ai.apiKey` is set.
- The cost estimate is best-effort based on a hardcoded pricing table for the most common models. Your provider's billing dashboard is authoritative.

### Privacy

Triage sends finding rule IDs, severities, messages, and (optional) page URLs to the configured provider. Messages may contain page titles or short content excerpts (per existing rule outputs). Use the **Ollama** provider to keep all data on your machine.

### Failure modes (fail-open)

Any error in the AI step (auth, rate-limit, network, unparseable response, missing SDK) skips triage with a stderr message. The audit completes normally — exit code, JSON output, and findings list are unchanged.

## Telemetry (local-only)

Opt-in. Writes a JSONL log of your audit runs to `.pseolint/telemetry.jsonl`. **Nothing is sent anywhere** — no network calls, no phoning home. This is yours to inspect.

### Enable

```bash
pseolint ./site --telemetry
```

Or in `pseolint.config.ts`:
```ts
export default {
  telemetry: { enabled: true },
};
```

### What gets recorded

Counts only — no URLs, no page content, no API keys:

- Audit: `runId`, `timestamp`, `durationMs`, `verdict`, `risk`, `pageCount`, `findingCount`, optional `cacheStats`, optional `triage` metadata (model, token counts, cache hit, cost estimate). (`score` is retained as an alias for `risk` for backward compatibility through v0.4.)
- Feedback: `runId`, `timestamp`, `rating`.

### View

```bash
pseolint stats            # pretty summary
pseolint stats --json     # machine-readable
```

### Triage feedback

When AI triage runs, you'll see a one-line prompt after the section:
```
Was this triage helpful? [y/n/skip]
```
Skippable. Suppress with `--no-telemetry-prompt` or `telemetry.prompt: false`.

In CI (no TTY), the prompt auto-skips. Pass `--triage-feedback helpful|unhelpful` to record a rating non-interactively.

### Share

```bash
pseolint stats-export /tmp/tel.jsonl
```
Copies your file so you can inspect it before sharing. No automatic upload.

## Documentation

See the full documentation at [github.com/ouranos-labs/pseolint](https://github.com/ouranos-labs/pseolint).

## License

MIT
