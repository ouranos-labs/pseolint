---
"@pseolint/core": patch
"pseolint": patch
"@pseolint/mcp": patch
"@pseolint/web": patch
"@pseolint/action": patch
---

v0.7.3 — render-aware checks, AI content-effort, and bring-your-own inputs.

Verdict moderators never change the raw `risk` number, so CI gates keyed off `--ci-threshold` stay stable.

- **Bring-your-own authority.** New `--authority-score <0-100>` CLI flag and `authorityScore` config key, alongside the existing MCP `authorityScore` param and a per-domain setting in the Pro web dashboard. `>= 80` shifts the verdict one tier lenient, `<= 30` one tier stricter. The engine stays authority-blind by design.
- **AI content-effort signal.** New `--content-effort` (+ `--content-effort-model`) CLI flag, `AuditOptions.contentEffort`, and an optional MCP `contentEffort` param. An LLM judges a 0-100 content originality/effort score from sampled page text (≤10 pages, content-hash cached) that moderates the verdict ±1 tier. Opt-in, needs `ANTHROPIC_API_KEY`, no-ops safely without one (~$0.003/page on claude-sonnet-4-6). Resolved score is written to `summary.contentEffort.score`. Runs automatically for Pro audits in the web app.
- **Render-aware crawl checks.** `--render` (Playwright, Node-only) now feeds two render-diff rules: `tech/csr-bailout` flags pages whose substantive content/interactivity exists only after client-side JS (invisible to crawlers + the first indexing pass), and `tech/soft-404` probes one synthetic nonexistent URL per template cluster (an HTTP 200 means the directory will index unbounded junk). Both no-op without `--render` / outside programmatic directories.
- **MCP rule knowledge as resources.** The MCP server now exposes the pSEO rule catalog as resources (`pseolint://rules` index + `pseolint://rules/<ruleId>` per-rule Markdown) so assistants can explain findings without guessing. The open knowledge bundle is also served at `/okf` and linked from `llms.txt`.
