# @pseolint/mcp

> MCP server for pseolint — audit programmatic SEO sites from AI coding assistants.

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes [pseolint](https://www.npmjs.com/package/pseolint) auditing tools to AI coding assistants like Claude Code, Claude Desktop, Cursor, and Windsurf.

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

**Example prompt**: "Use the orchestrate_audit tool to run an AI-native audit of https://example.com with concrete fix proposals."

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

### `orchestrate_audit` (v0.5)

Drive an LLM through 25 audit tools and produce a fix manifest with concrete patches. Use when a user wants paste-able fixes (not just a list of issues). Costs ~$1-3 per audit on managed Anthropic.

**Parameters:**
- `domain` (required) — URL of the site to audit (e.g. https://example.com)
- `maxCostUsd` — Hard USD cap (default 2)
- `maxToolCalls` — Hard tool-call cap (default 60)
- `maxWallSeconds` — Hard wall-clock cap (default 180)
- `format` — `summary` (terse text) or `json` (full manifest + validation + diff)

**Returns**: text summary with verdict + categories + top-3 patches per bucket (or full JSON when `format: "json"`). Validation failures listed separately so the LLM-host conversation stays grounded in what actually shipped.

**Example prompt:** "Use orchestrate_audit on https://example.com with format=summary"

### `audit_site`

Run a full pseolint audit on a URL or directory path. Returns the SpamBrain Risk Score (0-100) and all findings with actionable fix suggestions.

**Parameters:**
- `source` (required) — URL or directory path to audit
- `threshold` — Score threshold for pass/fail (default: 40)
- `sampleSize` — Audit a random subset of N pages (0 = all)
- `format` — Output format: `console` or `json` (default: console)

**Example prompt:** "Audit my site at http://localhost:3000 for SpamBrain risk"

### `explain_score`

Run an audit and get a human-readable explanation of what's driving the SpamBrain Risk Score, including category breakdowns, top issues, and prioritized fix suggestions.

**Parameters:**
- `source` (required) — URL or directory path to audit

**Example prompt:** "Explain why my site's SpamBrain score is high"

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

34 rules across 6 categories:

- **SpamBrain Risk** — near-duplicate detection, entity-swap doorway pages, thin content, boilerplate ratio
- **Content Quality** — unique value per page, heading/meta uniqueness, E-E-A-T signals
- **Internal Linking** — orphan pages, dead ends, cluster connectivity, link depth
- **Technical SEO** — canonical consistency, sitemap completeness, robots.txt conflicts
- **Structured Data** — JSON-LD validation, required fields, schema consistency
- **Cannibalization** — title overlap, keyword collision, URL pattern conflicts

## Links

- [GitHub](https://github.com/ouranos-labs/pseolint)
- [npm: pseolint](https://www.npmjs.com/package/pseolint)
- [npm: @pseolint/core](https://www.npmjs.com/package/@pseolint/core)

## License

MIT
