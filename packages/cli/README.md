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

## Documentation

See the full documentation at [github.com/ouranos-labs/pseolint](https://github.com/ouranos-labs/pseolint).

## License

MIT
