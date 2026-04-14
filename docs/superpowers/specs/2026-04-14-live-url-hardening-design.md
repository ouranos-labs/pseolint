# Live URL Scanning Hardening — Design Spec

**Date:** 2026-04-14
**Scope:** Make live-URL scanning the primary audit path by capturing HTTP metadata, adding crawl-based page discovery, and enhancing tech rules with HTTP-level signals.

---

## 1. HTTP Metadata Capture

### Problem

The loader currently discards everything from the HTTP response except the body text and content-type. Status codes, redirect chains, X-Robots-Tag headers, and Link headers are lost. These are critical indexing signals that only exist on live sites.

### Types

Add to `packages/core/src/types.ts`:

```typescript
export interface HttpMeta {
  statusCode: number;
  finalUrl: string;
  redirectChain: string[];
  xRobotsTag: string;
  linkHeader: string;
}
```

Add optional `httpMeta` to both `LoadedPage` (internal) and `ParsedPage`:

```typescript
// LoadedPage (in auditor.ts)
interface LoadedPage {
  url: string;
  html: string;
  httpMeta?: HttpMeta;
}

// ParsedPage (in types.ts) — add after authorSignals
httpMeta?: HttpMeta;
```

### Loader Changes (`auditor.ts`)

Replace the current `fetchWithRetry` with a richer fetch function:

```typescript
async function fetchPageWithMeta(
  url: string,
  timeoutMs: number
): Promise<LoadedPage | null> {
  const redirectChain: string[] = [];
  let currentUrl = url;

  for (let hop = 0; hop < 10; hop += 1) {
    try {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) break;
        redirectChain.push(currentUrl);
        currentUrl = new URL(location, currentUrl).href;
        continue;
      }

      const html = await response.text();
      return {
        url,
        html,
        httpMeta: {
          statusCode: response.status,
          finalUrl: currentUrl,
          redirectChain,
          xRobotsTag: response.headers.get("x-robots-tag") ?? "",
          linkHeader: response.headers.get("link") ?? "",
        },
      };
    } catch {
      return null;
    }
  }
  return null;
}
```

The old `fetchWithRetry` (used for sitemap fetching) stays as-is — only page fetches get the rich metadata. `fetchTextStrict` (used for the initial source URL) also stays unchanged.

### Parser Changes

In `parseHtmlPage`, pass `httpMeta` through to the `ParsedPage` output. The parser receives it from the `LoadedPage` and includes it unchanged:

```typescript
return {
  url,
  // ... existing fields ...
  httpMeta: loadedPage.httpMeta,  // passed through from loader
};
```

Since `parseHtmlPage` currently takes `(html, url, options)`, we need to either add a fourth parameter or pass `httpMeta` separately in `auditSource` after parsing. The cleaner approach: set `httpMeta` on the parsed page in `auditSource` after the `map` call, since `parseHtmlPage` shouldn't know about HTTP.

### Filesystem pages

`httpMeta` is `undefined` for filesystem pages. All rules that check `httpMeta` guard with an early continue.

---

## 2. Link-Crawl Discovery

### Problem

Sitemap-only discovery misses pages that are crawlable but not in the sitemap. These phantom pages waste crawl budget and may include low-quality content that affects the site's overall quality signal.

### Algorithm

After fetching all sitemap pages:

1. Parse internal links from each fetched page's HTML (reuse `resolvedHrefs` from the parser).
2. Filter to same-origin URLs not already in the sitemap set.
3. Fetch the delta pages using `fetchPageWithMeta` with the existing concurrency controls.
4. Add discovered pages to the audit set, marked with `discoveredViaCrawl: true` on `LoadedPage`.
5. Single depth only — do not follow links from the discovered pages.

### Config

```typescript
// AuditOptions
crawlDiscovery?: boolean;  // default: true for URL sources, false for filesystem
```

CLI flag: `--no-crawl` to disable.

### New Rule: `tech/sitemap-completeness`

Replaces the existing `tech/robots-sitemap-presence` rule (which only checks if robots.txt/sitemap.xml exist).

**What it checks:**
- Pages found via crawl but missing from sitemap → `error`: "12 crawlable pages not in your sitemap"
- Sitemap URLs that return non-200 (404, 410, 500) → `error`: "3 sitemap URLs return non-200 status codes"
- Sitemap URLs that redirect to a different URL → `warning`: "5 sitemap URLs redirect to different locations"

**Severity:** `error` for missing/broken pages, `warning` for redirects.

**Only runs for URL sources** — filesystem audits skip this rule.

The old `tech/robots-sitemap-presence` rule is removed and replaced by this one.

---

## 3. Enhanced Tech Rules

### `tech/canonical-consistency` — HTTP header support

Currently checks `<link rel="canonical">` in HTML only.

Enhanced behavior:
- Parse `Link` HTTP header for `rel="canonical"` (format: `<url>; rel="canonical"`)
- If canonical exists in both HTML and HTTP header and they disagree → new finding: "HTML canonical and HTTP Link header canonical conflict" (severity: `error`)
- If canonical URL was reached via redirect, verify canonical matches the final URL, not the requested URL
- Existing HTML-only checks remain unchanged

### `tech/robots-noindex-conflict` — X-Robots-Tag support

Currently checks `<meta name="robots">` in HTML only.

Enhanced behavior:
- Also check `httpMeta.xRobotsTag` for `noindex`, `nofollow` directives
- Parse the X-Robots-Tag value (can be comma-separated directives, optionally prefixed with user-agent)
- If either HTML meta robots or X-Robots-Tag contains `noindex`, the page is treated as noindexed
- Existing HTML-only behavior unchanged for filesystem pages

### New Rule: `tech/redirect-chain`

- Flags pages where `httpMeta.redirectChain.length > 2` — long redirect chains waste crawl budget
- Flags pages where the final URL has a different path from the requested URL (unexpected redirect destination)
- Severity: `warning`
- Fix: "Reduce redirect chain to a single hop. Update internal links and sitemap to point to the final URL."
- Ref: `https://developers.google.com/search/docs/crawling-indexing/301-redirects`

### New Rule: `tech/soft-404`

- Flags pages that return HTTP 200 but have characteristics of error pages:
  - Content text < 50 words AND title contains "not found", "404", "error", "page missing" (case-insensitive)
- These are soft 404s — Google detects them and may devalue the entire site
- Severity: `error`
- Fix: "This page looks like an error page but returns HTTP 200. Return a proper 404 status code instead."
- Ref: `https://developers.google.com/search/docs/crawling-indexing/soft-404-errors`
- Only runs when `httpMeta` is available (URL sources only)

---

## 4. Summary of Rule Changes

| Rule | Status | Change |
|------|--------|--------|
| `tech/robots-sitemap-presence` | **Removed** | Replaced by `tech/sitemap-completeness` |
| `tech/sitemap-completeness` | **New** | Sitemap vs crawl comparison, phantom URL detection |
| `tech/redirect-chain` | **New** | Long redirect chains and unexpected destinations |
| `tech/soft-404` | **New** | HTTP 200 pages that look like error pages |
| `tech/canonical-consistency` | **Enhanced** | Also checks HTTP `Link` header for canonical |
| `tech/robots-noindex-conflict` | **Enhanced** | Also checks `X-Robots-Tag` header |

Total rules after this: 34 (was 31, +3 new, -1 removed = net +2, but `tech/robots-sitemap-presence` was already partial, so effectively 34).

---

## Deferred

- Full recursive crawling (Screaming Frog territory — different product)
- Response time / TTFB metrics (performance monitoring, not pSEO compliance)
- Cache header analysis (crawl budget inference — hosted platform feature)
- HTTPS enforcement checking (valuable but separate concern)
