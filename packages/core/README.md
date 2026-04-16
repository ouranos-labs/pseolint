# @pseolint/core

> Programmatic SEO audit engine — 34 rules across 6 categories for SpamBrain risk detection.

The core engine behind [pseolint](https://www.npmjs.com/package/pseolint). Use this package to integrate pSEO auditing into your own tools.

## Install

```bash
npm install @pseolint/core
```

## Usage

```typescript
import { auditSource } from "@pseolint/core";

const summary = await auditSource("./out");
console.log(`Score: ${summary.score}/100`);
console.log(`Findings: ${summary.findings.length}`);
```

## What It Checks

34 rules across 6 categories:

- **SpamBrain Risk** — near-duplicate detection (SimHash), entity-swap doorway pages, thin content, boilerplate ratio, template diversity
- **Content Quality** — unique value per page, heading/meta uniqueness, author attribution, E-E-A-T signals
- **Internal Linking** — orphan pages, dead ends, cluster connectivity, hub pages, link depth
- **Technical SEO** — canonical consistency, sitemap completeness, soft 404s, redirect chains, hreflang, Open Graph
- **Structured Data** — JSON-LD validation, required fields, schema consistency
- **Cannibalization** — title overlap, keyword collision, URL pattern conflicts

## API

### `auditSource(source, options?)`

Audits a directory path or URL. Returns an `AuditSummary` with score, category scores, and enriched findings.

### Formatters

```typescript
import { formatConsole, formatJson, formatMarkdown, formatHtml } from "@pseolint/core";

const output = formatConsole(summary);
const json = formatJson(summary);
const md = formatMarkdown(summary);
const html = formatHtml(summary);
```

## License

MIT
