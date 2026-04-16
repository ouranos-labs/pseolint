# pSEO Lint

> SpamBrain-proof your pSEO before you publish.

The only tool purpose-built for **programmatic SEO compliance**. Audits page *relationships*, not just pages. Detects the exact patterns Google's SpamBrain targets: near-duplicates, entity-swap doorway pages, thin content clusters, and missing internal linking.

Every finding includes an **actionable fix** backed by a **Google documentation reference**.

**ESLint for programmatic SEO.**

## Quick Start

```bash
# Point it at your local dev server — that's it
npx pseolint http://localhost:3000
```

Automatically discovers all pages by following internal links. No sitemap, no config, no build step needed.

```bash
# Save a visual report
npx pseolint http://localhost:3000 --format html --output report.html

# Audit a live site
npx pseolint https://yoursite.com

# CI gate on build output
npx pseolint ./out --threshold 40 --format json
```

## Audit Modes

| Mode | Command | What you get |
|------|---------|-------------|
| **Local dev server** | `npx pseolint http://localhost:3000` | Full rendered pages, HTTP headers, redirect detection, crawl discovery. **Best results.** |
| **Live site** | `npx pseolint https://yoursite.com` | Same as above against production. Slower (network latency). |
| **Build directory** | `npx pseolint ./out` | Static HTML files only. No HTTP headers, no redirect detection, no soft-404 detection, no sitemap comparison. Use for CI gates. |

> **Why localhost is recommended:** Build directories contain framework artifacts (Next.js `[slug].html` shells, empty client-rendered pages) that produce false positives. Your dev server renders the actual pages Google will see — with canonicals, meta tags, and full content.

## What It Checks

**34 rules** across **6 categories**, producing a weighted **SpamBrain Risk Score** (0-100):

### SpamBrain Risk Detection

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `spam/near-duplicate` | SimHash similarity between all page pairs (>85%) | Critical |
| `spam/entity-swap` | Doorway pages where only a proper noun changes | Critical |
| `spam/doorway-pattern` | Composite: entity-swap + thin + identical structure + same meta | Critical |
| `spam/thin-content` | Pages below 300 words (excluding nav/header/footer) | Error |
| `spam/boilerplate-ratio` | Pages with >70% shared template content | Error |
| `spam/template-diversity` | Identical DOM structure across all pages | Warning |
| `spam/publication-velocity` | >100 pages sharing the same publish date | Warning |
| `spam/template-coverage` | Template dimension coverage (e.g. 87 of 960 possible combinations) | Info |

### Content Quality

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `content/unique-value` | Each page must have 100+ words not found on any other page | Error |
| `content/meta-uniqueness` | Meta descriptions identical after entity masking | Error |
| `content/heading-uniqueness` | H1/H2 tags identical after entity masking | Warning |
| `content/missing-author` | No author schema, meta, byline, or rel="author" | Warning |
| `content/eeat-signals` | Missing E-E-A-T signals (author, dates, sources, about links) | Info |

### Internal Linking

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `links/orphan-pages` | Pages with zero inbound internal links | Error |
| `links/dead-ends` | Pages with zero outbound internal links | Warning |
| `links/cluster-connectivity` | Isolated page clusters with no cross-linking | Warning |
| `links/hub-pages` | Missing index/hub page for page clusters | Warning |
| `links/link-depth` | Pages requiring >3 clicks from root | Info |

### Technical SEO

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `tech/canonical-consistency` | Missing, invalid, or conflicting canonical URLs (HTML + HTTP header) | Error |
| `tech/sitemap-completeness` | Pages missing from sitemap, phantom 404s, redirecting sitemap URLs | Error |
| `tech/soft-404` | HTTP 200 pages that look like error pages | Error |
| `tech/robots-noindex-conflict` | Noindexed pages (meta or X-Robots-Tag) with inbound links | Warning |
| `tech/canonical-noindex-conflict` | Noindex + canonical pointing elsewhere | Warning |
| `tech/redirect-chain` | Redirect chains longer than 2 hops | Warning |
| `tech/og-completeness` | Missing og:title, og:description, or og:image | Warning |
| `tech/hreflang-consistency` | Hreflang reciprocity (A->B requires B->A) | Warning |

### Structured Data

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `schema/json-ld-valid` | Malformed JSON-LD, missing @context or @type | Error |
| `schema/required-fields` | Article/Product/FAQ missing required fields | Warning |
| `schema/consistency` | Mixed schema types across template pages | Info |

### Cannibalization

| Rule | What It Checks | Severity |
|------|---------------|----------|
| `cannibal/title-overlap` | Page pairs with >80% title similarity after entity masking | Warning |
| `cannibal/keyword-collision` | Pages sharing >6 of their top 10 TF-IDF keywords | Warning |
| `cannibal/url-pattern` | URL structures with same tokens in different order | Info |

## Live URL Scanning

When you point pseolint at a URL, it captures what Google sees:

- **HTTP metadata** — status codes, redirect chains, X-Robots-Tag, Link headers
- **Crawl discovery** — follows internal links from the start page to find all crawlable pages
- **Sitemap comparison** — if a sitemap exists, compares it against crawl-discovered pages

```bash
# Just give it your homepage — it discovers everything
npx pseolint https://paperforge.dev
```

## Page Groups

Different page types need different standards. Configure groups in `pseolint.config.ts`:

```typescript
export default {
  pageGroups: {
    pseo: {
      match: '/templates/**',
      rules: ['spam/*', 'content/*', 'links/*', 'cannibal/*', 'tech/*', 'schema/*'],
      overrides: {
        'spam/thin-content': { thinContentMinWords: 500 },
      }
    },
    listing: {
      match: ['/documents', '/templates'],
      rules: ['tech/*'],
    },
    marketing: {
      match: ['/', '/about', '/pricing'],
      rules: ['tech/*'],
    },
    utility: {
      match: ['**/404*', '**/500*'],
      rules: [],  // skip entirely
    }
  }
};
```

Each group gets its own score. Unmatched pages get all rules.

## SpamBrain Risk Score

Weighted composite score from 0 (safe) to 100 (critical):

```
score = (spam * 0.40) + (content * 0.25) + (links * 0.15)
      + (tech * 0.10) + (schema * 0.05) + (cannibal * 0.05)
```

| Score | Label | CI Exit |
|-------|-------|---------|
| 0-20 | Safe | 0 |
| 21-40 | Caution | 0 |
| 41-60 | Risky | 1 |
| 61-80 | Dangerous | 1 |
| 81-100 | Critical | 1 |

## CLI Options

```
Usage: pseolint [options] <source>

Arguments:
  source                    URL or directory path to audit

Options:
  -f, --format <type>       Output format: console, json, markdown, html (default: "console")
  -t, --threshold <n>       Score threshold for CI exit code (default: 40)
  -o, --output <file>       Write report to file instead of stdout
  --no-color                Disable colored output
  --concurrency <n>         Max parallel HTTP fetches (default: 5)
  --timeout <ms>            Per-request timeout in ms (default: 30000)
  --sample-size <n>         Audit a random subset of N pages (default: all)
  --ignore <patterns>       Comma-separated glob patterns to exclude
  --render                  Render pages in a browser before auditing
  --browser-ws <url>        CDP WebSocket endpoint for browser rendering
  --no-crawl                Disable crawl-based page discovery
  -V, --version             Output version number
  -h, --help                Display help
```

## Browser Rendering

For client-rendered sites (React SPAs, Next.js app router), use `--render` to capture the fully rendered DOM:

```bash
# With a remote CDP endpoint (Browserless, etc.)
PSEOLINT_BROWSER_WS=wss://your-browser:3000 npx pseolint https://yoursite.com --render

# With local Playwright
npm install playwright-core
npx playwright install chromium
npx pseolint https://yoursite.com --render
```

Works with any CDP-compatible browser. Remote endpoints must use `wss://`.

## GitHub Action

```yaml
name: pSEO Lint
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm run build
      - uses: ouranos-labs/pseolint@action-v1
        with:
          source: ./out
          threshold: 40
```

Posts a score summary as a PR comment and fails the check if score exceeds the threshold.

## Output Formats

```bash
npx pseolint https://yoursite.com                  # Colored terminal (default)
npx pseolint https://yoursite.com --format json    # CI-friendly JSON
npx pseolint https://yoursite.com --format markdown # PR comments / docs
npx pseolint https://yoursite.com --format html    # Self-contained visual report
```

## Monorepo

| Package | npm | License |
|---------|-----|---------|
| `packages/core` | `@pseolint/core` | MIT |
| `packages/cli` | `pseolint` | MIT |
| `packages/action` | GitHub Action | MIT |
| `apps/web` | pseolint.dev | AGPL-3.0 |

## Development

```bash
bun install
bun run build
bun run test     # 142 tests across 26 files
```

## License

MIT (packages) / AGPL-3.0 (apps/web)
