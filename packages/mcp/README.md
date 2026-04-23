# @pseolint/mcp

> MCP server for pseolint — audit programmatic SEO sites from AI coding assistants.

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes [pseolint](https://www.npmjs.com/package/pseolint) auditing tools to AI coding assistants like Claude Code, Claude Desktop, Cursor, and Windsurf.

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
