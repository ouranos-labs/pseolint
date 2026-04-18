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

### Quick start (cloud)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
pseolint https://example.com --ai
```

### Quick start (local, zero data leaves your machine)

```bash
ollama pull llama3.1:8b
ollama serve &
pseolint https://example.com --ai --ai-provider ollama
```

### Flags

```
--ai                          Enable AI triage
--ai-provider <id>            anthropic | ollama (default: auto-detect)
--ai-model <name>             Override default model
--ai-endpoint <url>           Override Ollama endpoint (default: http://localhost:11434)
--ai-max-tokens <n>           Input token cap per triage call (default: 60000)
--ai-cache-ttl <duration>     Triage cache TTL (default: 30d)
--no-ai-cache                 Bypass cache for this run
--no-ai-suggest               Suppress discovery hint when key detected
```

### How it works

After the linter runs, the AI step takes the enriched findings (capped at 200 by severity) and asks the model to identify 1–5 underlying root causes ranked by SEO impact. The findings list is unchanged — triage is an *additional* section above it.

### Cost and budget

- Triage runs as **one** model call per audit. Default cap: 60k input tokens.
- Estimated cost is printed before/after the call (best-effort lookup; pricing may be stale).
- Results are cached at `.pseolint/ai-cache/` for 30 days. Re-running on unchanged audit data is free.
- Cache key includes the prompt version — bumping it auto-invalidates the cache.

### Privacy

Triage sends finding rule IDs, severities, messages, and (optional) page URLs to the configured provider. Messages may contain page titles or short content excerpts (per existing rule outputs). Use the **Ollama** provider to keep all data on your machine.

### Failure modes (fail-open)

Any error in the AI step (auth, rate-limit, network, unparseable response, missing SDK) skips triage with a stderr message. The audit completes normally — exit code, JSON output, and findings list are unchanged.

## Documentation

See the full documentation at [github.com/ouranos-labs/pseolint](https://github.com/ouranos-labs/pseolint).

## License

MIT
