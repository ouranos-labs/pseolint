# Live URL Scanning Hardening: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make live-URL scanning the primary audit path by capturing HTTP metadata (status codes, redirects, X-Robots-Tag, Link header), adding crawl-based page discovery, and implementing 3 new tech rules (sitemap-completeness, redirect-chain, soft-404).

**Architecture:** Extend `LoadedPage` and `ParsedPage` with `HttpMeta`. Replace page-level fetch with a redirect-following `fetchPageWithMeta`. Add single-depth crawl discovery after sitemap loading. Implement 3 new rules and enhance 2 existing rules to use HTTP signals. Remove the old `robots-sitemap-presence` rule.

**Tech Stack:** TypeScript, node:http (fetch API with `redirect: "manual"`), vitest

---

### Task 1: Add HttpMeta type and extend ParsedPage

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add HttpMeta interface and extend types**

Add `HttpMeta` interface before `ParsedPage` in `packages/core/src/types.ts`:

```typescript
export interface HttpMeta {
  statusCode: number;
  finalUrl: string;
  redirectChain: string[];
  xRobotsTag: string;
  linkHeader: string;
}
```

Add `httpMeta?: HttpMeta;` to `ParsedPage` (after `html: string;`):

```typescript
  html: string;
  httpMeta?: HttpMeta;
```

Add `crawlDiscovery?: boolean;` to `AuditOptions` (after `ignore`):

```typescript
  /** Discover pages by following links, not just sitemap (default: true for URLs). */
  crawlDiscovery?: boolean;
```

- [ ] **Step 2: Verify build**

Run: `cd packages/core && bun run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add HttpMeta type and crawlDiscovery option

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Implement fetchPageWithMeta

**Files:**
- Modify: `packages/core/src/auditor.ts`

- [ ] **Step 1: Add fetchPageWithMeta function**

Add this function after `fetchTextStrict` in `packages/core/src/auditor.ts`. Also extend the `LoadedPage` interface to include `httpMeta`:

Update `LoadedPage`:
```typescript
interface LoadedPage {
  url: string;
  html: string;
  httpMeta?: import("./types.js").HttpMeta;
}
```

Add the new fetch function (after `fetchWithRetry`):

```typescript
async function fetchPageWithMeta(
  url: string,
  timeoutMs: number
): Promise<LoadedPage | null> {
  const redirectChain: string[] = [];
  let currentUrl = url;

  for (let hop = 0; hop < 10; hop += 1) {
    let response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return null;
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (!location) break;
      redirectChain.push(currentUrl);
      try {
        currentUrl = new URL(location, currentUrl).href;
      } catch {
        break;
      }
      continue;
    }

    let html: string;
    try {
      html = await response.text();
    } catch {
      return null;
    }

    return {
      url,
      html,
      httpMeta: {
        statusCode: status,
        finalUrl: currentUrl,
        redirectChain,
        xRobotsTag: response.headers.get("x-robots-tag") ?? "",
        linkHeader: response.headers.get("link") ?? "",
      },
    };
  }
  return null;
}
```

- [ ] **Step 2: Verify build**

Run: `cd packages/core && bun run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/auditor.ts
git commit -m "feat(core): add fetchPageWithMeta with redirect following and header capture

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Wire fetchPageWithMeta into the loader and pass httpMeta through

**Files:**
- Modify: `packages/core/src/auditor.ts`

- [ ] **Step 1: Update loadPagesFromSource to use fetchPageWithMeta for URL sources**

In `loadPagesFromSource`, replace the sitemap page-fetching block. Currently (around line 501-507):

```typescript
      const pages: LoadedPage[] = [];
      await runWithConcurrency(urls, concurrency, async (url) => {
        const result = await fetchWithRetry(url, timeoutMs);
        if (result) {
          pages.push({ url, html: result.text });
        }
      });
```

Replace with:

```typescript
      const pages: LoadedPage[] = [];
      await runWithConcurrency(urls, concurrency, async (url) => {
        const result = await fetchPageWithMeta(url, timeoutMs);
        if (result) {
          pages.push(result);
        }
      });
```

Also update the single-HTML-page branch (around line 511) to capture metadata:

```typescript
    if (contentType.includes("html") || looksLikeHtml(text)) {
      return [{ url: source, html: text }];
    }
```

This stays as-is for now since the initial fetch uses `fetchTextStrict` which doesn't capture headers. The single-page case is less important than sitemaps.

- [ ] **Step 2: Pass httpMeta through to ParsedPage in auditSource**

In `auditSource`, after the `parsedPages` map (around line 609), add httpMeta from the loaded pages:

```typescript
  const parsedPages = sampled.map((page) => {
    const parsed = parseHtmlPage(page.html, page.url, { normalizeUrl: normalizeUrlOptions });
    if (page.httpMeta) {
      (parsed as any).httpMeta = page.httpMeta;
    }
    return parsed;
  });
```

This is slightly hacky, the cleaner approach would be for `parseHtmlPage` to accept `httpMeta`. But since `parseHtmlPage` is about HTML parsing and `httpMeta` is just passthrough, the cast is acceptable. The `httpMeta` field already exists on `ParsedPage` as optional.

- [ ] **Step 3: Verify existing tests still pass**

Run: `cd packages/core && bun run test`
Expected: all tests pass (filesystem pages just get `httpMeta: undefined`).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/auditor.ts
git commit -m "feat(core): wire fetchPageWithMeta into loader, pass httpMeta to ParsedPage

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Add crawl-based page discovery

**Files:**
- Modify: `packages/core/src/auditor.ts`
- Test: `packages/core/tests/integration/auditor.test.ts`

- [ ] **Step 1: Write test**

Add to the end of `describe("auditSource", ...)` in `packages/core/tests/integration/auditor.test.ts`:

```typescript
  test("discovers pages via crawl that are not in sitemap", async () => {
    const sitemapPages: Record<string, string> = {
      "https://example.dev/page-a": `<html><body><h1>A</h1><a href="/page-b">B</a><a href="/unlisted">Unlisted</a><p>${"alpha ".repeat(300)}</p></body></html>`,
      "https://example.dev/page-b": `<html><body><h1>B</h1><a href="/page-a">A</a><p>${"beta ".repeat(300)}</p></body></html>`
    };
    const unlistedPage = `<html><body><h1>Unlisted</h1><p>${"gamma ".repeat(300)}</p></body></html>`;

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.dev/page-a</loc></url>
        <url><loc>https://example.dev/page-b</loc></url>
      </urlset>`;

    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const isManual = (init as any)?.redirect === "manual";

      if (url === "https://example.dev/sitemap.xml") {
        return new Response(sitemap, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url === "https://example.dev/unlisted") {
        return new Response(unlistedPage, { status: 200, headers: { "content-type": "text/html" } });
      }
      const body = sitemapPages[url];
      if (body) {
        return new Response(body, { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const summary = await auditSource("https://example.dev/sitemap.xml", {
      crawlDiscovery: true,
    });
    // Should discover page-a, page-b from sitemap + unlisted from crawl
    expect(summary.pageCount).toBe(3);
    // Should have sitemap-completeness finding for the unlisted page
    expect(summary.findings.some((f) => f.ruleId === "tech/sitemap-completeness")).toBe(true);
  });
```

- [ ] **Step 2: Implement crawl discovery in loadPagesFromSource**

After the sitemap pages are fetched (after the `runWithConcurrency` block in the URL branch), add:

```typescript
      // Crawl discovery: follow internal links to find pages not in sitemap
      if (crawlDiscovery) {
        const sitemapUrlSet = new Set(urls.map((u) => normalizeAuditUrl(u, { stripQuery: true })));
        const discoveredUrls = new Set<string>();

        for (const page of pages) {
          // Quick parse to extract links
          const linkMatches = Array.from(page.html.matchAll(/href=["']([^"']+)["']/gi));
          for (const match of linkMatches) {
            const href = match[1];
            if (!href || href.startsWith("#") || /^mailto:|^tel:|^javascript:|^data:/i.test(href)) continue;
            try {
              const resolved = new URL(href, page.httpMeta?.finalUrl ?? page.url).href;
              const resolvedUrl = new URL(resolved);
              const sourceOrigin = new URL(source).origin;
              if (resolvedUrl.origin !== sourceOrigin) continue;
              const normalized = normalizeAuditUrl(resolved, { stripQuery: true });
              if (!sitemapUrlSet.has(normalized) && !discoveredUrls.has(normalized)) {
                discoveredUrls.add(normalized);
              }
            } catch {
              continue;
            }
          }
        }

        if (discoveredUrls.size > 0) {
          await runWithConcurrency(Array.from(discoveredUrls), concurrency, async (url) => {
            const result = await fetchPageWithMeta(url, timeoutMs);
            if (result && result.httpMeta && result.httpMeta.statusCode >= 200 && result.httpMeta.statusCode < 300) {
              pages.push(result);
            }
          });
        }
      }
```

Update `loadPagesFromSource` signature to accept `crawlDiscovery`:

```typescript
async function loadPagesFromSource(
  source: string,
  concurrency: number,
  timeoutMs: number,
  crawlDiscovery: boolean
): Promise<LoadedPage[]> {
```

In `auditSource`, update the call:

```typescript
  const crawlDiscovery = /^https?:\/\//i.test(source) && (options?.crawlDiscovery ?? true);
  const loadedPages = await loadPagesFromSource(source, concurrency, timeoutMs, crawlDiscovery);
```

- [ ] **Step 3: Run tests**

Run: `cd packages/core && bun run test`
Expected: all tests pass. The crawl discovery test may need the `normalizeAuditUrl` import, if the function isn't accessible in the scope, import it.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/auditor.ts packages/core/tests/integration/auditor.test.ts
git commit -m "feat(core): add single-depth crawl discovery for pages not in sitemap

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Implement tech/sitemap-completeness rule

**Files:**
- Create: `packages/core/src/rules/tech/sitemap-completeness.ts`
- Create: `packages/core/tests/rules/tech/sitemap-completeness.test.ts`
- Modify: `packages/core/src/index.ts` (add export)
- Modify: `packages/core/src/rule-references.ts` (add ref)

- [ ] **Step 1: Write tests**

Create `packages/core/tests/rules/tech/sitemap-completeness.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { sitemapCompletenessRule } from "../../../src/rules/tech/sitemap-completeness.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: "", ...overrides
  };
}

describe("sitemapCompletenessRule", () => {
  test("flags pages found via crawl but missing from sitemap", () => {
    const sitemapUrls = new Set(["https://example.com/a", "https://example.com/b"]);
    const allPages = [
      page("https://example.com/a"),
      page("https://example.com/b"),
      page("https://example.com/c"),
    ];
    const findings = sitemapCompletenessRule(allPages, sitemapUrls);
    expect(findings.some((f) => f.message.includes("not in sitemap"))).toBe(true);
    expect(findings[0].severity).toBe("error");
  });

  test("flags sitemap URLs with non-200 status", () => {
    const sitemapUrls = new Set(["https://example.com/a", "https://example.com/gone"]);
    const allPages = [
      page("https://example.com/a", { httpMeta: { statusCode: 200, finalUrl: "https://example.com/a", redirectChain: [], xRobotsTag: "", linkHeader: "" } }),
      page("https://example.com/gone", { httpMeta: { statusCode: 404, finalUrl: "https://example.com/gone", redirectChain: [], xRobotsTag: "", linkHeader: "" } }),
    ];
    const findings = sitemapCompletenessRule(allPages, sitemapUrls);
    expect(findings.some((f) => f.message.includes("404"))).toBe(true);
  });

  test("flags sitemap URLs that redirect", () => {
    const sitemapUrls = new Set(["https://example.com/old"]);
    const allPages = [
      page("https://example.com/old", { httpMeta: { statusCode: 200, finalUrl: "https://example.com/new", redirectChain: ["https://example.com/old"], xRobotsTag: "", linkHeader: "" } }),
    ];
    const findings = sitemapCompletenessRule(allPages, sitemapUrls);
    expect(findings.some((f) => f.message.includes("redirect"))).toBe(true);
  });

  test("no findings when sitemap matches crawl exactly", () => {
    const sitemapUrls = new Set(["https://example.com/a", "https://example.com/b"]);
    const allPages = [
      page("https://example.com/a"),
      page("https://example.com/b"),
    ];
    expect(sitemapCompletenessRule(allPages, sitemapUrls)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement the rule**

Create `packages/core/src/rules/tech/sitemap-completeness.ts`:

```typescript
import type { ParsedPage, RuleResult } from "../../types.js";

export function sitemapCompletenessRule(
  pages: ParsedPage[],
  sitemapUrls: Set<string>
): RuleResult[] {
  if (sitemapUrls.size === 0) return [];

  const findings: RuleResult[] = [];

  // Pages found via crawl but missing from sitemap
  const missingFromSitemap = pages.filter((p) => !sitemapUrls.has(p.url));
  if (missingFromSitemap.length > 0) {
    findings.push({
      ruleId: "tech/sitemap-completeness",
      severity: "error",
      message: `${missingFromSitemap.length} crawlable page(s) not in sitemap.`,
      fix: "Add these pages to your sitemap.xml to ensure Google discovers them.",
      relatedUrls: missingFromSitemap.map((p) => p.url).sort()
    });
  }

  // Sitemap URLs with non-200 status codes
  for (const page of pages) {
    if (!page.httpMeta || !sitemapUrls.has(page.url)) continue;

    if (page.httpMeta.statusCode >= 400) {
      findings.push({
        ruleId: "tech/sitemap-completeness",
        severity: "error",
        message: `Sitemap URL ${page.url} returns HTTP ${page.httpMeta.statusCode}.`,
        pageUrl: page.url,
        fix: `Remove this URL from sitemap.xml or fix the page to return HTTP 200.`
      });
    }

    if (page.httpMeta.redirectChain.length > 0 && page.httpMeta.finalUrl !== page.url) {
      findings.push({
        ruleId: "tech/sitemap-completeness",
        severity: "warning",
        message: `Sitemap URL ${page.url} redirects to ${page.httpMeta.finalUrl}.`,
        pageUrl: page.url,
        relatedUrls: [page.httpMeta.finalUrl],
        fix: `Update sitemap.xml to use the final URL: ${page.httpMeta.finalUrl}`
      });
    }
  }

  return findings;
}
```

- [ ] **Step 3: Export, add ref, run tests**

Add to `packages/core/src/index.ts`:
```typescript
export * from "./rules/tech/sitemap-completeness.js";
```

Add to `packages/core/src/rule-references.ts`:
```typescript
  "tech/sitemap-completeness": "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
  "tech/redirect-chain": "https://developers.google.com/search/docs/crawling-indexing/301-redirects",
  "tech/soft-404": "https://developers.google.com/search/docs/crawling-indexing/soft-404-errors",
```

Run: `cd packages/core && bun run test`
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/rules/tech/sitemap-completeness.ts packages/core/tests/rules/tech/sitemap-completeness.test.ts packages/core/src/index.ts packages/core/src/rule-references.ts
git commit -m "feat(core): add tech/sitemap-completeness rule

Compares sitemap URLs against crawl-discovered pages, flags phantom
URLs with non-200 status, and detects sitemap URLs that redirect.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Implement tech/redirect-chain rule

**Files:**
- Create: `packages/core/src/rules/tech/redirect-chain.ts`
- Create: `packages/core/tests/rules/tech/redirect-chain.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/tests/rules/tech/redirect-chain.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { redirectChainRule } from "../../../src/rules/tech/redirect-chain.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: "", ...overrides
  };
}

describe("redirectChainRule", () => {
  test("flags pages with redirect chains longer than 2 hops", () => {
    const p = page("https://example.com/a", {
      httpMeta: {
        statusCode: 200,
        finalUrl: "https://example.com/d",
        redirectChain: ["https://example.com/a", "https://example.com/b", "https://example.com/c"],
        xRobotsTag: "", linkHeader: ""
      }
    });
    const findings = redirectChainRule([p]);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("3");
  });

  test("does not flag pages with 1 redirect", () => {
    const p = page("https://example.com/a", {
      httpMeta: {
        statusCode: 200,
        finalUrl: "https://example.com/b",
        redirectChain: ["https://example.com/a"],
        xRobotsTag: "", linkHeader: ""
      }
    });
    expect(redirectChainRule([p])).toHaveLength(0);
  });

  test("skips pages without httpMeta", () => {
    expect(redirectChainRule([page("file.html")])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement**

Create `packages/core/src/rules/tech/redirect-chain.ts`:

```typescript
import type { ParsedPage, RuleResult } from "../../types.js";

export function redirectChainRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.httpMeta) continue;
    const hops = page.httpMeta.redirectChain.length;
    if (hops <= 2) continue;

    findings.push({
      ruleId: "tech/redirect-chain",
      severity: "warning",
      message: `${page.url} has a ${hops}-hop redirect chain before reaching ${page.httpMeta.finalUrl}.`,
      pageUrl: page.url,
      relatedUrls: [...page.httpMeta.redirectChain, page.httpMeta.finalUrl],
      fix: `Reduce the redirect chain to a single hop. Update internal links and sitemap to point to ${page.httpMeta.finalUrl}.`
    });
  }

  return findings;
}
```

- [ ] **Step 3: Export, run tests, commit**

Add to `packages/core/src/index.ts`:
```typescript
export * from "./rules/tech/redirect-chain.js";
```

Run: `cd packages/core && bun run test`

```bash
git add packages/core/src/rules/tech/redirect-chain.ts packages/core/tests/rules/tech/redirect-chain.test.ts packages/core/src/index.ts
git commit -m "feat(core): add tech/redirect-chain rule

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Implement tech/soft-404 rule

**Files:**
- Create: `packages/core/src/rules/tech/soft-404.ts`
- Create: `packages/core/tests/rules/tech/soft-404.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write tests**

Create `packages/core/tests/rules/tech/soft-404.test.ts`:

```typescript
import { describe, expect, test } from "vitest";
import { soft404Rule } from "../../../src/rules/tech/soft-404.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: "", ...overrides
  };
}

describe("soft404Rule", () => {
  test("flags 200 page with 'not found' in title and thin content", () => {
    const p = page("https://example.com/missing", {
      title: "Page Not Found",
      contentText: "Sorry, this page does not exist.",
      httpMeta: { statusCode: 200, finalUrl: "https://example.com/missing", redirectChain: [], xRobotsTag: "", linkHeader: "" }
    });
    const findings = soft404Rule([p]);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("error");
  });

  test("does not flag 200 page with real content", () => {
    const p = page("https://example.com/real", {
      title: "Real Page",
      contentText: "word ".repeat(200),
      httpMeta: { statusCode: 200, finalUrl: "https://example.com/real", redirectChain: [], xRobotsTag: "", linkHeader: "" }
    });
    expect(soft404Rule([p])).toHaveLength(0);
  });

  test("does not flag actual 404 responses", () => {
    const p = page("https://example.com/gone", {
      title: "Not Found",
      contentText: "Gone",
      httpMeta: { statusCode: 404, finalUrl: "https://example.com/gone", redirectChain: [], xRobotsTag: "", linkHeader: "" }
    });
    expect(soft404Rule([p])).toHaveLength(0);
  });

  test("skips pages without httpMeta", () => {
    expect(soft404Rule([page("file.html")])).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement**

Create `packages/core/src/rules/tech/soft-404.ts`:

```typescript
import type { ParsedPage, RuleResult } from "../../types.js";

const SOFT_404_PATTERNS = /\b(not\s*found|404|page\s*missing|does\s*not\s*exist|no\s*longer\s*available)\b/i;

export function soft404Rule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.httpMeta) continue;
    if (page.httpMeta.statusCode !== 200) continue;

    const wordCount = page.contentText.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 50) continue;

    if (SOFT_404_PATTERNS.test(page.title)) {
      findings.push({
        ruleId: "tech/soft-404",
        severity: "error",
        message: `${page.url} returns HTTP 200 but appears to be an error page (title: "${page.title}", ${wordCount} words).`,
        pageUrl: page.url,
        fix: "Return a proper HTTP 404 status code for error pages instead of 200."
      });
    }
  }

  return findings;
}
```

- [ ] **Step 3: Export, run tests, commit**

Add to `packages/core/src/index.ts`:
```typescript
export * from "./rules/tech/soft-404.js";
```

Run: `cd packages/core && bun run test`

```bash
git add packages/core/src/rules/tech/soft-404.ts packages/core/tests/rules/tech/soft-404.test.ts packages/core/src/index.ts
git commit -m "feat(core): add tech/soft-404 rule for HTTP 200 error pages

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Enhance canonical-consistency and robots-noindex with HTTP signals

**Files:**
- Modify: `packages/core/src/rules/tech/canonical-consistency.ts`
- Modify: `packages/core/src/rules/tech/robots-noindex-conflict.ts`

- [ ] **Step 1: Enhance canonical-consistency**

In `packages/core/src/rules/tech/canonical-consistency.ts`, add HTTP `Link` header canonical checking. After the existing HTML canonical check, add:

```typescript
    // Check HTTP Link header for canonical
    if (page.httpMeta?.linkHeader) {
      const linkCanonicalMatch = page.httpMeta.linkHeader.match(/<([^>]+)>;\s*rel="canonical"/i);
      if (linkCanonicalMatch) {
        const httpCanonical = normalizeAuditUrl(linkCanonicalMatch[1], normalizeOpts);
        const htmlCanonical = resolveCanonicalUrl(page.canonical, page.url, normalizeOpts);
        if (httpCanonical && htmlCanonical && httpCanonical !== htmlCanonical) {
          findings.push({
            ruleId: "tech/canonical-consistency",
            severity: "error",
            message: `${page.url} has conflicting canonical URLs: HTML says ${htmlCanonical}, HTTP Link header says ${httpCanonical}.`,
            pageUrl: page.url,
            relatedUrls: [htmlCanonical, httpCanonical],
            fix: "Ensure the HTML <link rel='canonical'> and HTTP Link header agree on the canonical URL."
          });
        }
      }
    }
```

Add this block inside the `for (const page of pages)` loop, after the existing checks (before the closing `}` of the loop). Guard with `if (page.httpMeta?.linkHeader)` so filesystem pages are skipped.

- [ ] **Step 2: Enhance robots-noindex-conflict**

In `packages/core/src/rules/tech/robots-noindex-conflict.ts`, also check `httpMeta.xRobotsTag`:

Replace the existing `robots` variable line:
```typescript
    const robots = page.robotsMeta.toLowerCase();
    if (!robots.includes("noindex")) {
      continue;
    }
```

With:
```typescript
    const htmlRobots = page.robotsMeta.toLowerCase();
    const httpRobots = (page.httpMeta?.xRobotsTag ?? "").toLowerCase();
    const isNoindex = htmlRobots.includes("noindex") || httpRobots.includes("noindex");
    if (!isNoindex) {
      continue;
    }

    const source = htmlRobots.includes("noindex") && httpRobots.includes("noindex")
      ? "both HTML meta and X-Robots-Tag"
      : htmlRobots.includes("noindex")
        ? "HTML meta"
        : "X-Robots-Tag header";
```

Update the message to include the source:
```typescript
    findings.push({
      ruleId: "tech/robots-noindex-conflict",
      severity: inboundCount > 0 ? "warning" : "info",
      message:
        inboundCount > 0
          ? `${page.url} is marked noindex (via ${source}) but has ${inboundCount} inbound internal links.`
          : `${page.url} is marked noindex (via ${source}).`,
      pageUrl: page.url,
      fix: inboundCount > 0
        ? "Either remove noindex or remove internal links pointing to this page."
        : "Verify this page should be noindexed."
    });
```

- [ ] **Step 3: Run tests**

Run: `cd packages/core && bun run test`
Expected: all tests pass (existing tests use pages without `httpMeta`, so the new branches aren't triggered).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/rules/tech/canonical-consistency.ts packages/core/src/rules/tech/robots-noindex-conflict.ts
git commit -m "feat(core): enhance canonical and robots rules with HTTP header signals

canonical-consistency now checks Link header for rel=canonical and
detects HTML/HTTP conflicts. robots-noindex-conflict now checks
X-Robots-Tag header alongside HTML meta robots.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Wire new rules into auditor and remove robots-sitemap-presence

**Files:**
- Modify: `packages/core/src/auditor.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Import new rules, remove old one**

In auditor.ts, replace the `robotsSitemapPresenceRule` import:
```typescript
import { robotsSitemapPresenceRule } from "./rules/tech/robots-sitemap-presence.js";
```

With the new rules:
```typescript
import { sitemapCompletenessRule } from "./rules/tech/sitemap-completeness.js";
import { redirectChainRule } from "./rules/tech/redirect-chain.js";
import { soft404Rule } from "./rules/tech/soft-404.js";
```

- [ ] **Step 2: Track sitemap URLs and pass to sitemap-completeness**

In `auditSource`, after `collectUrlsFromSitemap` returns (around line 499), save the sitemap URLs:

```typescript
      const sitemapUrlSet = new Set(urls);
```

Then pass it through to where rules are called. The simplest approach: store it on `auditSource`'s scope and pass to the site-wide rule block.

Replace the old `robotsSitemapPresence` call (around line 632-633):
```typescript
  const robotsSitemapPresence = await robotsSitemapPresenceRule(source);
  allFindings.push(...robotsSitemapPresence);
```

With:
```typescript
  // Site-wide rules (run once, outside group loop)
  if (sitemapUrlSet && sitemapUrlSet.size > 0) {
    const sitemapFindings = sitemapCompletenessRule(parsedPages, sitemapUrlSet);
    allFindings.push(...sitemapFindings.map((f) => ({ ...f, ref: f.ref ?? RULE_REFERENCES[f.ruleId] })));
  }
```

Note: `sitemapUrlSet` needs to be accessible in `auditSource`'s scope. Declare it before `loadPagesFromSource`:
```typescript
  let sitemapUrlSet: Set<string> | undefined;
```

And set it inside `loadPagesFromSource`, but since that's a separate function, the cleaner approach is to return it alongside pages. Change `loadPagesFromSource` return type to:
```typescript
async function loadPagesFromSource(
  source: string, concurrency: number, timeoutMs: number, crawlDiscovery: boolean
): Promise<{ pages: LoadedPage[]; sitemapUrls?: Set<string> }> {
```

Return `{ pages, sitemapUrls: new Set(urls) }` from the sitemap branch. Return `{ pages: [...] }` from other branches.

Update the call site in `auditSource`:
```typescript
  const { pages: loadedPages, sitemapUrls: sitemapUrlSet } = await loadPagesFromSource(source, concurrency, timeoutMs, crawlDiscovery);
```

- [ ] **Step 3: Add redirect-chain and soft-404 to runRulesOnPages**

In `runRulesOnPages`, add after the hreflang rule:

```typescript
  if (isEnabled("tech/redirect-chain")) {
    findings.push(...tag(redirectChainRule(pages)));
  }

  if (isEnabled("tech/soft-404")) {
    findings.push(...tag(soft404Rule(pages)));
  }
```

Remove the empty `tech/robots-sitemap-presence` block:
```typescript
  if (isEnabled("tech/robots-sitemap-presence")) {
    // This is async and site-wide, run only for __default group to avoid duplication
    // It's handled separately in auditSource
  }
```

- [ ] **Step 4: Remove robots-sitemap-presence from index.ts**

In `packages/core/src/index.ts`, remove:
```typescript
export * from "./rules/tech/robots-sitemap-presence.js";
```

Keep the file itself, just don't export it. Tests that import it directly will still work.

- [ ] **Step 5: Run tests, fix any breakage**

Run: `cd packages/core && bun run test`
Expected: most tests pass. The `robots-sitemap-presence.test.ts` may fail if it's imported via the index. Fix by importing directly from the file.

The integration test "checks robots and sitemap presence for URL audits" will need updating since the rule ID changed from `tech/robots-sitemap-presence` to `tech/sitemap-completeness`.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/auditor.ts packages/core/src/index.ts packages/core/tests/
git commit -m "feat(core): wire new HTTP rules, replace robots-sitemap-presence with sitemap-completeness

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Update CLI and config, add --no-crawl flag

**Files:**
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/config.ts`

- [ ] **Step 1: Add CLI flag**

In `packages/cli/src/cli.ts`, add after `--browser-ws`:
```typescript
    .option("--no-crawl", "Disable crawl-based page discovery for URL sources")
```

Add to `CliOptions`:
```typescript
  crawl: boolean;
```

In `cliFlags` construction:
```typescript
    crawlDiscovery: opts.crawl === false ? false : undefined,
```

Update `CliFlags` in config.ts:
```typescript
  crawlDiscovery?: boolean;
```

Update `mergeOptions`:
```typescript
  if (cliFlags.crawlDiscovery !== undefined) result.crawlDiscovery = cliFlags.crawlDiscovery;
```

Add to zod schema:
```typescript
  crawlDiscovery: z.boolean().optional(),
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/cli.ts packages/cli/src/config.ts
git commit -m "feat(cli): add --no-crawl flag to disable crawl discovery

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Full test suite**

Run: `bun run test`
Expected: all tests pass.

- [ ] **Step 2: Full build**

Run: `bun run build`
Expected: all packages build.

- [ ] **Step 3: Dogfood against PaperForge live**

If PaperForge dev server is running:
```bash
node packages/cli/dist/cli.js http://localhost:3000/sitemap.xml --format console --no-color
```

Otherwise against the build directory to verify no regressions:
```bash
node packages/cli/dist/cli.js "D:/phili/SSD_Projects/paperforge.dev/.next/server/app" --format console --no-color --ignore "**/_*"
```

- [ ] **Step 4: Git log**

Run: `git log --oneline -15`
Expected: clean commit history.
