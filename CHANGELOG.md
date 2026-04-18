# Changelog

Changelog for `pseolint`, `@pseolint/core`, and `@pseolint/mcp`. All three packages version together.

## 0.2.1 — 2026-04-18

### Fixed

- **Daily-budget cache-hit double-count.** `todayTriageSpendUsd` now excludes records where `triage.cacheHit === true`. Cache hits don't incur real API spend, so they must not count against `--ai-daily-budget`. Without this fix, re-running the same audit multiple times per day would over-report spend and falsely trip the budget cap.

### Documentation

- Clarified that `--ai-daily-budget` uses **UTC calendar day** for its rollover window. Users in non-UTC timezones see "today" roll over at their local offset from `00:00 UTC`.

## 0.2.0 — 2026-04-18

### Added

- **HTTP cache + delta-mode audits.** `--cache [dir]`, `--cache-ttl`, `--state [path]`, `--since`, `--exit-on-regression`. Cached fetches honor `ETag` / `Last-Modified` via 304 revalidation. Delta mode skips URLs whose content hash hasn't changed since the last run. ([caching spec](docs/superpowers/specs/2026-04-17-audit-caching-and-delta-design.md))
- **Stratified sampling.** `--strategy stratified|random`, `--max-per-template`. Samples allocated by sqrt of cluster size per inferred URL template so every template is represented.
- **AI triage.** Opt-in post-processing layer that turns enriched findings into 1–5 ranked root causes. `--ai`, `--ai-provider`, `--ai-model`, `--ai-endpoint`, `--ai-max-tokens`, `--ai-cache-ttl`, `--no-ai-cache`, `--no-ai-suggest`. ([triage spec](docs/superpowers/specs/2026-04-18-ai-triage-and-adapter-design.md))
- **Open provider registry.** Any Vercel AI SDK provider is supported — `anthropic`, `openai`, `google`, `mistral`, `groq`, `xai`, `cohere`, `ollama` (local). Install only the SDK you need; all are optional peer deps.
- **Cost safety.** `--ai-max-cost <usd>` refuses calls that exceed a per-call estimate cap. `--ai-daily-budget <usd>` reads today's successful-triage spend from local telemetry and refuses calls that would exceed a daily ceiling. Pre-flight cost estimate is printed to stderr before every call.
- **Local telemetry.** Opt-in `--telemetry` writes one JSONL record per audit run (counts only — no URLs, no content, no keys). `pseolint stats` aggregates. `pseolint stats-export <path>` copies the file for manual sharing. TTY-gated triage feedback prompt (y/n/skip) plus `--triage-feedback` for CI.
- **Data-source comparison rules.** `dataSource` option verifies rendered pages against expected key-value data. `data/missing-binding` and `data/identical-across-pages` rules flag divergence.
- **MCP server.** `@pseolint/mcp` exposes three tools — `audit_site`, `explain_score`, `check_page_technical`. `PSEOLINT_MCP_SAMPLE_CAP` env var raises the internal sample cap for larger sites.

### Changed

- Retrofit the AI layer to the Vercel AI SDK — replaces the hand-rolled `LlmAdapter`, `AdapterError`, JSON validator, and DI seam. Net: ~700 LOC deleted, structured-output validation handled by `generateObject({ schema })`.
- `AuditOptions.ai.provider` accepts any registered provider string. `AuditSummary.triage` is new.

### Fixed

- Replaced the `discoveryBudget` egress band-aid with the HTTP-cache + 304 revalidation path. Re-running against the same site costs near-zero egress.
- Narrative is now optional in the triage schema so LLM truncation yields partial but usable results.

### Deprecated / Removed

- `LlmAdapter`, `AdapterError`, `createAdapter`, `__setAnthropicClientFactory`. These were internal — no public consumers existed.
- `@anthropic-ai/sdk` is no longer a peer dependency; replaced by `@ai-sdk/anthropic`.

## 0.1.0 — initial public release
