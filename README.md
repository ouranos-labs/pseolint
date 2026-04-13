# pSEO Lint

> SpamBrain-proof your pSEO before you publish.

The only tool purpose-built for **programmatic SEO compliance**. Audits page *relationships*, not just pages. Detects the exact patterns Google's SpamBrain targets: near-duplicates, entity-swap doorway pages, thin content clusters, and missing internal linking.

**ESLint for programmatic SEO.**

## Quick Start

```bash
# Audit a local build directory
npx pseolint ./out

# Audit a Next.js build
npx pseolint ./.next/server/app --ignore "**/_*,**/\[*"

# Audit a live site via sitemap
npx pseolint https://example.com/sitemap.xml

# CI mode with threshold
npx pseolint ./out --threshold 40 --format json
```

## What It Checks

**30 rules** across **6 categories**, producing a weighted **SpamBrain Risk Score** (0-100):

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
| `tech/canonical-consistency` | Missing or invalid canonical URLs | Error |
| `tech/robots-noindex-conflict` | Noindexed pages with inbound links | Warning |
| `tech/canonical-noindex-conflict` | Noindex + canonical pointing elsewhere | Warning |
| `tech/og-completeness` | Missing og:title, og:description, or og:image | Warning |
| `tech/hreflang-consistency` | Hreflang reciprocity (A->B requires B->A) | Warning |
| `tech/robots-sitemap-presence` | Missing robots.txt or sitemap.xml (remote only) | Warning |

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
  source                    Directory path or URL to audit

Options:
  -f, --format <type>       Output format: console, json, markdown, html (default: "console")
  -t, --threshold <n>       Score threshold for CI exit code (default: 40)
  -o, --output <file>       Write report to file instead of stdout
  --no-color                Disable colored output
  --concurrency <n>         Max parallel HTTP fetches (default: 5)
  --timeout <ms>            Per-request timeout in ms (default: 30000)
  --sample-size <n>         Audit a random subset of N pages (default: all)
  --ignore <patterns>       Comma-separated glob patterns to exclude
  -V, --version             Output version number
  -h, --help                Display help
```

## Configuration

Create a `pseolint.config.ts` (or `.pseolintrc.json`, `pseolint.config.js`, etc.):

```typescript
export default {
  rules: {
    'spam/near-duplicate': { threshold: 0.85 },
    'spam/thin-content': { minWords: 300 },
    'content/unique-value': { minUniqueWords: 100 },
  },
  concurrency: 5,
  timeout: 30000,
  sampleSize: 500,
  ignore: ['/api/**', '/_next/**', '/_*'],
};
```

## Output Formats

```bash
npx pseolint ./out                     # Colored terminal (default)
npx pseolint ./out --format json       # CI-friendly JSON
npx pseolint ./out --format markdown   # PR comments / docs
npx pseolint ./out --format html       # Self-contained visual report
```

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

## Framework Tips

### Next.js (Static Export)

```bash
# Use static export for best results
next build && next export
npx pseolint ./out
```

### Next.js (Server Build)

```bash
# Exclude dynamic route shells and internal pages
npx pseolint ./.next/server/app --ignore "**/_*,**/\\[*"
```

### Astro

```bash
npx pseolint ./dist
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
bun run test     # 100 tests across 21 files
```

## License

MIT (packages) / AGPL-3.0 (apps/web)
