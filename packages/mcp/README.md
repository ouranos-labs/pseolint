# @pseolint/mcp

> MCP server for pseolint — audit pSEO sites by template from AI coding assistants.

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes [pseolint](https://www.npmjs.com/package/pseolint) v0.7.3 auditing tools to AI coding assistants like Claude Code, Claude Desktop, Cursor, and Windsurf.

All tools are namespaced with a `pseolint_` prefix (`pseolint_audit_site`, `pseolint_explain_score`, `pseolint_check_page_technical`, `pseolint_orchestrate_audit`) so they don't collide with other MCP servers, and each returns both human-readable text and machine-readable `structuredContent`.

### What's new in v0.6 — per-template output in tool responses

`audit_site` now returns a `templates` array alongside the existing `findings` list. AI clients get the per-template view automatically — no parameter changes needed.

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

When iterating `templates`, the `topDriver` rule + `fireRate` is the most actionable signal: "8/10 samples fail `spam/thin-content`" tells the LLM which template is broken and what to fix. The `findings` flat list remains available for per-URL drill-down.

Design rationale: [`docs/superpowers/specs/2026-05-04-pseolint-v0.6-audit-as-template-reframe.md`](../../docs/superpowers/specs/2026-05-04-pseolint-v0.6-audit-as-template-reframe.md)

### What's new in v0.5.2 — credibility layer

- **4 new content-quality rules** in the underlying engine (consumed by `audit_site` and `orchestrate_audit`): `content/title-uniqueness`, `content/heading-structure`, `content/image-alt-text`, `tech/og-completeness`. Findings appear in tool output as standard rule findings.
- **`audit_site.authorityScore`** parameter (0-100) — bring-your-own-DA. `>= 80` shifts the verdict one tier lenient on established brands; `<= 30` shifts one tier stricter on newer/lower-authority operators. Raw `risk` number unchanged.
- **`audit_site.sampleSeed`** parameter — deterministic sampler. Same seed = same audit = same verdict, run after run. AI assistants asking the user to confirm a finding can re-audit reproducibly.
- **`spam/doorway-pattern` cluster collapse** — a 276-pair finding on a catalog directory now arrives as one cluster line per group, not 276 line items eating the LLM's context window.
- **Findings stay actionable**: info-severity findings are capped per category bucket so they can't accumulate to tank a verdict on their own; the LLM gets the actual signal, not noise.
- **Calibrated** against reputable in-production pSEO sites; trade-offs and limitations documented at [pseolint.dev/methodology](https://pseolint.dev/methodology).

### What's new in v0.5

**`orchestrate_audit` tool.** Drives an LLM through 25 deterministic audit tools and produces a fix manifest with concrete copy-paste patches (rewritten H1s, JSON-LD blocks, robots.txt diffs). Use when a user wants concrete fixes — not just a list of issues.

**Conservative MCP defaults**: $2 / 60 tool calls / 180 seconds wall (vs CLI's $5 / 100 / 300). Two output modes: `summary` (terse text for chat UI) and `json` (full manifest + validation + diff). Each invocation reports actual USD spend. Patches that fail deterministic validators are dropped from the manifest and surfaced separately.

**Example prompt**: "Use the pseolint_orchestrate_audit tool to run an AI-native audit of https://example.com with concrete fix proposals."

### Safety defaults (v0.3.3+)

All three tools default to `safeMode: "saas"` — AI assistants running in end-user
environments can't be tricked into scanning AWS/GCP metadata endpoints, localhost,
or RFC1918 networks via a malicious URL argument. Specifically:

- `guardSsrf: true` — DNS-validated private-range check on the source URL,
  sitemap entries, redirect hops, and discovered links
- `respectRobotsTxt: true` — sitemap URLs Disallow'd by the target's `robots.txt`
  are skipped instead of crawled
- Tighter `maxFetchBytes` (10 MB) and `maxCrawlDiscovered` (2000) caps

## Tools

### `pseolint_orchestrate_audit` (v0.5)

Drive an LLM through 25 audit tools and produce a fix manifest with concrete patches. Use when a user wants paste-able fixes (not just a list of issues). Costs ~$1-3 per audit on managed Anthropic.

**Parameters:**
- `domain` (required) — URL of the site to audit (e.g. https://example.com)
- `maxCostUsd` — Hard USD cap (default 2)
- `maxToolCalls` — Hard tool-call cap (default 60)
- `maxWallSeconds` — Hard wall-clock cap (default 180)
- `format` — `summary` (terse text) or `json` (full manifest + validation + diff)

**Returns**: text summary with verdict + categories + top-3 patches per bucket (or full JSON when `format: "json"`). Validation failures listed separately so the LLM-host conversation stays grounded in what actually shipped.

**Example prompt:** "Use pseolint_orchestrate_audit on https://example.com with format=summary"

### `pseolint_audit_site`

Run a full pseolint audit on a URL or directory path. Returns the site-level verdict + risk score, a `templates` array (per-template verdicts + variance metrics), and all per-URL findings with actionable fix suggestions.

**Parameters:**
- `source` (required) — URL or directory path to audit
- `threshold` — Score threshold for pass/fail (default: 40)
- `sampleSize` — Audit a random subset of N pages (0 = all)
- `format` — Output format: `console` or `json` (default: console)
- `authorityScore` — 0-100 domain authority hint. ≥80 shifts verdict one tier lenient; ≤30 shifts one tier stricter. Raw `risk` number unchanged.
- `contentEffort` (boolean, default false) — enable the AI content-effort signal: an LLM judges a 0-100 originality/effort score from sampled page text that moderates the verdict ±1 tier. Requires `ANTHROPIC_API_KEY` in the MCP server's environment; no-ops safely without one. Adds a few cents of LLM cost per audit.
- `sampleSeed` — Integer seed for deterministic stratified sampling. Same seed = same audit = same verdict.

**Returns (v0.6 shape):** `verdict`, `risk`, `categories`, `templates: Template[]`, `findings: RuleResult[]`. AI clients should iterate `templates` first — `topDriver.ruleId + fireRate` is the most actionable per-template signal. Use `findings` for per-URL drill-down.

**Example prompt:** "Audit my site at http://localhost:3000 — show me the per-template breakdown"

### `pseolint_explain_score`

Run an audit and get a human-readable explanation of what's driving the SpamBrain Risk Score, including category breakdowns, top issues, and prioritized fix suggestions.

**Parameters:**
- `source` (required) — URL or directory path to audit
- `threshold` — Risk threshold for the pass/fail verdict (default: 40)
- `authorityScore` — 0-100 domain authority hint. ≥80 shifts verdict one tier lenient; ≤30 shifts one tier stricter. Raw `risk` number unchanged.
- `contentEffort` (boolean, default false) — enable the AI content-effort signal: an LLM judges a 0-100 originality/effort score from sampled page text that moderates the verdict ±1 tier. Requires `ANTHROPIC_API_KEY` in the MCP server's environment; no-ops safely without one. Adds a few cents of LLM cost per audit.
- `sampleSeed` — Integer seed for deterministic stratified sampling.

**Example prompt:** "Explain why my site's SpamBrain score is high"

### `pseolint_check_page_technical`

Check a single page URL for per-page technical SEO issues (canonical, Open Graph, JSON-LD, robots, meta, thin content, author signals). Does not run cross-page rules — use `pseolint_audit_site` for those.

**Parameters:**
- `url` (required) — Full URL of the page to check

**Example prompt:** "Check https://yoursite.com/templates/california-llc for technical SEO issues"

## Resources

The server also exposes pseolint's rule knowledge as read-only [MCP resources](https://modelcontextprotocol.io), so an assistant can explain a finding without guessing or fetching the web. The resources are keyed by `ruleId`, the same identifier that appears on every audit finding (e.g. `spam/thin-content`), so they line up 1:1 with tool output.

- **`pseolint://rules`** — a JSON index of every documented rule (`ruleId`, `title`, and the per-rule resource URI). Read this first to discover what's available.
- **`pseolint://rules/<ruleId>`** — one Markdown resource per rule, e.g. `pseolint://rules/spam/thin-content`. Each contains the rule's link, a **What it detects** section, and a **How to fix** checklist.

Typical flow: run `pseolint_audit_site`, take a `ruleId` off a finding, then read `pseolint://rules/<ruleId>` to ground the explanation and fix advice in pseolint's own rule documentation.

## Remote server (hosted, zero-install)

Prefer not to install anything? Point your MCP client at the hosted endpoint:

    https://pseolint.dev/mcp

It serves the three read-only audit tools (`pseolint_audit_site`, `pseolint_explain_score`,
`pseolint_check_page_technical`) with no signup — anonymous use is rate-limited. Create an
API key in your pseolint.dev dashboard and send it as `Authorization: Bearer <key>` to raise
your limits. The AI-orchestrated `pseolint_orchestrate_audit` tool is available only via the
stdio package (below) or the CLI for now.

Example client config:

    { "url": "https://pseolint.dev/mcp", "headers": { "Authorization": "Bearer <key>" } }

## Installation

### Claude Code

```bash
claude mcp add pseolint -- npx @pseolint/mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pseolint": {
      "command": "npx",
      "args": ["@pseolint/mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "pseolint": {
      "command": "npx",
      "args": ["@pseolint/mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "pseolint": {
      "command": "npx",
      "args": ["@pseolint/mcp"]
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "pseolint": {
      "command": "npx",
      "args": ["@pseolint/mcp"]
    }
  }
}
```

## What It Checks

44 rules, grouped by theme (scored across 4 categories: integrity, discoverability, citation, data):

- **SpamBrain Risk** — near-duplicate detection, entity-swap doorway pages, thin content, boilerplate ratio
- **Content Quality** — unique value per page, heading/meta uniqueness, E-E-A-T signals
- **Internal Linking** — orphan pages, dead ends, cluster connectivity, link depth
- **Technical SEO** — canonical consistency, sitemap completeness, robots.txt conflicts
- **Structured Data** — JSON-LD validation, required fields, schema consistency
- **Cannibalization** — URL pattern conflicts (`title-overlap` and `keyword-collision` were dropped in v0.4 for high false-positive rates)

## Links

- [GitHub](https://github.com/ouranos-labs/pseolint)
- [npm: pseolint](https://www.npmjs.com/package/pseolint)
- [npm: @pseolint/core](https://www.npmjs.com/package/@pseolint/core)

## License

MIT
