import { afterEach, describe, expect, test } from "vitest";
import { auditSource } from "../../src/auditor.js";

/**
 * Backpressure salvage: when the in-flight watchdog (backpressure.ts) decides
 * the origin is degraded and aborts mid-crawl, auditSource must NOT throw away
 * everything it collected. It runs the rest of the pipeline over the pages
 * fetched before the abort and returns an AuditSummary flagged `truncated:true`
 * with a non-empty `truncatedReason`.
 *
 * Reproduction (mirrors the real user run at --concurrency 5 against a single
 * dev server): the first ~10 page fetches succeed (warmup, no aborts), then the
 * origin starts returning 5xx. Once the rolling 5xx rate clears the watchdog's
 * 0.15 threshold the monitor trips, the audit signal aborts, and the in-flight
 * fetch worker throws — but the salvaged pages survive.
 */

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function htmlBody(title: string): string {
  // ~350 words so pages aren't dropped as thin content / SPA shells.
  return `<html><head><title>${title}</title></head><body><h1>${title}</h1><p>${"content ".repeat(350)}</p></body></html>`;
}

/** Build a sitemap with `n` URLs under example.dev. */
function buildSitemap(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${urls.map((u) => `<url><loc>${u}</loc></url>`).join("\n")}
    </urlset>`;
}

describe("auditSource — backpressure partial-report salvage", () => {
  test("flushes a truncated report with the pages fetched before the watchdog abort", async () => {
    const base = "https://degraded.dev";
    const goodUrls = Array.from({ length: 12 }, (_, i) => `${base}/good-${i}`);
    // Plenty of failing URLs after the good ones so the rolling 5xx window trips.
    const badUrls = Array.from({ length: 30 }, (_, i) => `${base}/bad-${i}`);
    const allUrls = [...goodUrls, ...badUrls];
    const sitemap = buildSitemap(allUrls);

    let liveFetches = 0;

    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      // Honor the abort signal the way a real fetch would: once the watchdog
      // aborts, in-flight/subsequent requests reject. This is what makes the
      // crawl actually STOP after the watchdog fires (origin protection) and
      // makes loadPagesFromSource throw so the salvage path is exercised.
      if (init?.signal?.aborted) {
        throw init.signal.reason ?? new DOMException("aborted", "AbortError");
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response(sitemap, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url.endsWith("/robots.txt")) {
        return new Response("", { status: 404 });
      }
      if (url.endsWith("/llms.txt")) {
        return new Response("", { status: 404 });
      }
      // Page fetches: the /good- URLs succeed (warmup baseline), /bad- URLs 503.
      if (url.startsWith(`${base}/good-`)) {
        liveFetches += 1;
        return new Response(htmlBody(url), { status: 200, headers: { "content-type": "text/html" } });
      }
      if (url.startsWith(`${base}/bad-`)) {
        liveFetches += 1;
        return new Response("origin overloaded", { status: 503, headers: { "content-type": "text/html" } });
      }
      return new Response("Not found", { status: 404 });
    }) as typeof fetch;

    const summary = await auditSource(`${base}/sitemap.xml`, {
      // concurrency 1 keeps the abort timing deterministic: the watchdog trips
      // on a 503 observation and the very next fetch sees signal.aborted.
      concurrency: 1,
      // Disable the dev preset's tiny budget; we're not localhost here anyway,
      // but be explicit so all sitemap URLs are eligible to fetch.
      autoDevPreset: false,
    });

    // Salvage, not crash.
    expect(summary.truncated).toBe(true);
    expect(typeof summary.truncatedReason).toBe("string");
    expect(summary.truncatedReason && summary.truncatedReason.length).toBeGreaterThan(0);
    expect(summary.truncatedReason).toMatch(/degraded/i);

    // The good pages fetched before the abort survived into the report.
    expect(summary.pageCount).toBeGreaterThan(0);
    // We aborted before fetching all 42 URLs — coverage is a lower bound.
    expect(summary.pageCount).toBeLessThan(allUrls.length);
    expect(liveFetches).toBeLessThan(allUrls.length);
  });

  test("returns a valid truncated summary even when zero pages survive the abort", async () => {
    // The watchdog can trip on the FIRST live fetches in a degenerate origin.
    // We simulate the extreme case where every page 503s after warmup but no
    // body ever lands in the page set, so the salvaged set is empty. The result
    // must still be a well-formed truncated summary, never a throw.
    const base = "https://allbad.dev";
    const urls = Array.from({ length: 40 }, (_, i) => `${base}/p-${i}`);
    const sitemap = buildSitemap(urls);

    let n = 0;
    globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.signal?.aborted) {
        throw init.signal.reason ?? new DOMException("aborted", "AbortError");
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response(sitemap, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url.endsWith("/robots.txt") || url.endsWith("/llms.txt")) {
        return new Response("", { status: 404 });
      }
      // Warmup needs SOME 200s to establish a baseline; after that every fetch
      // is a slow 503 that yields no usable body. fetchPageWithMeta returns the
      // page object for any status, so to force an empty salvage we 503 with an
      // empty body and rely on the content-type filter dropping the warmup 200s
      // is not what we want — instead we make warmup pages non-HTML so they are
      // dropped, leaving the eventual summary with zero audited pages.
      n += 1;
      if (n <= 11) {
        // Non-HTML body during warmup: passes the fetch but is content-type
        // filtered out, so the audited page set ends up empty.
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("origin overloaded", { status: 503, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const summary = await auditSource(`${base}/sitemap.xml`, {
      concurrency: 1,
      autoDevPreset: false,
    });

    expect(summary.truncated).toBe(true);
    expect(summary.truncatedReason && summary.truncatedReason.length).toBeGreaterThan(0);
    // Zero audited pages is acceptable; a crash is not. The buckets are valid.
    expect(summary.pageCount).toBe(0);
    expect(Array.isArray(summary.issues.blockers)).toBe(true);
    expect(Array.isArray(summary.issues.shouldFix)).toBe(true);
    expect(Array.isArray(summary.issues.informational)).toBe(true);
    expect(summary.diagnostics).toBeDefined();
  });

  test("a clean origin produces a complete (non-truncated) report", async () => {
    // Guard: salvage must not leak into the happy path.
    const base = "https://healthy.dev";
    const urls = Array.from({ length: 6 }, (_, i) => `${base}/ok-${i}`);
    const sitemap = buildSitemap(urls);

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/sitemap.xml")) {
        return new Response(sitemap, { status: 200, headers: { "content-type": "application/xml" } });
      }
      if (url.endsWith("/robots.txt") || url.endsWith("/llms.txt")) {
        return new Response("", { status: 404 });
      }
      return new Response(htmlBody(url), { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const summary = await auditSource(`${base}/sitemap.xml`, { concurrency: 1, autoDevPreset: false });
    expect(summary.truncated).toBeUndefined();
    expect(summary.truncatedReason).toBeUndefined();
    expect(summary.pageCount).toBe(urls.length);
  });
});
