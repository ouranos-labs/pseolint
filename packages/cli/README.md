# pseolint

> SpamBrain-proof your pSEO before you publish.

The only tool purpose-built for **programmatic SEO compliance**. Audits page *relationships*, not just pages. Detects the exact patterns Google's SpamBrain targets.

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

# Audit a live site
npx pseolint https://yoursite.com

# Audit a build directory
npx pseolint ./out --threshold 40

# Save an HTML report
npx pseolint http://localhost:3000 --format html --output report.html
```

## Options

```
-f, --format <type>       console, json, markdown, html (default: "console")
-t, --threshold <n>       Score threshold for CI exit code (default: 40)
-o, --output <file>       Write report to file
--no-color                Disable colored output
--concurrency <n>         Max parallel HTTP fetches (default: 5)
--timeout <ms>            Per-request timeout (default: 30000)
--sample-size <n>         Audit a random subset of N pages
--ignore <patterns>       Comma-separated glob patterns to exclude
--render                  Render pages in a browser before auditing
--browser-ws <url>        CDP WebSocket endpoint for rendering
--no-crawl                Disable crawl-based page discovery
```

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

### Run state + delta mode

Persist audit state across runs for CI/monitoring:

```bash
# First run (writes baseline state)
pseolint https://example.com --state

# Subsequent run: audit only changed pages
pseolint https://example.com --state --since

# Monitoring: fail on new rule ID regressions
pseolint https://example.com --state --exit-on-regression
```

State is stored at `.pseolint/state.json` by default. Commit it to share baseline across CI workers. On the first run (no prior state), `--since` and `--exit-on-regression` bootstrap gracefully — they audit everything and write state without erroring.

Switching between `--render` modes invalidates prior state (different renderMode produces different hashes), triggering a full re-audit.

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
- **Daily budget:** `--ai-max-cost 0.50 --ai-daily-budget 5.00 --telemetry` reads today's successful-triage spend from your local telemetry JSONL and refuses the call when the running total would breach the budget.
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

- Audit: `runId`, `timestamp`, `durationMs`, `score`, `pageCount`, `findingCount`, optional `cacheStats`, optional `triage` metadata (model, token counts, cache hit, cost estimate).
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
