import { afterEach, describe, expect, it } from "vitest";
import { auditSource } from "../../src/auditor.js";

/**
 * Coverage guardrails (#4). Two independent under-coverage signals, both tagged
 * `truncatedKind: "coverage"`:
 *   (A) a sitemap INDEX referenced child sitemaps we couldn't fetch/parse, OR
 *   (B) we FETCHED far fewer pages than the sitemap declares.
 * Plus the false-positive guards that distinguish under-discovery from the
 * operator's deliberate choices (noindex pages, a small crawl cap) — the bugs
 * the first cut of this guardrail shipped with.
 */

const BASE = "http://localhost:9992";
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function html(title: string, opts: { noindex?: boolean } = {}): string {
  const robots = opts.noindex ? `<meta name="robots" content="noindex">` : "";
  return `<!doctype html><html><head><title>${title}</title>${robots}</head><body><h1>${title}</h1><p>${"unique words here ".repeat(40)}</p></body></html>`;
}
function urlset(urls: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
}
function sitemapindex(sitemaps: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemaps.map((s) => `<sitemap><loc>${s}</loc></sitemap>`).join("")}</sitemapindex>`;
}
type Reply = { status?: number; body: string; contentType?: string } | null;
function install(handler: (pathname: string) => Reply): void {
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const pathname = new URL(typeof input === "string" ? input : input.toString()).pathname;
    const r = handler(pathname);
    if (!r) return new Response("", { status: 404 });
    return new Response(r.body, { status: r.status ?? 200, headers: { "content-type": r.contentType ?? "text/html" } });
  }) as typeof fetch;
}

const declared = Array.from({ length: 40 }, (_, i) => `${BASE}/p-${i}`);

describe("declared-vs-discovered coverage guardrail", () => {
  it("(B) flags coverage when far fewer pages are fetched than the sitemap declares", async () => {
    install((p) => {
      if (p === "/robots.txt") return { body: `Sitemap: ${BASE}/sitemap.xml\n`, contentType: "text/plain" };
      if (p === "/sitemap.xml") return { body: urlset(declared), contentType: "application/xml" };
      if (p === "/") return { body: html("Home") };
      return null; // every declared content page 404s → fetched ~1
    });
    const summary = await auditSource(BASE, { backpressure: false });
    expect(summary.truncated).toBe(true);
    expect(summary.truncatedKind).toBe("coverage");
    expect(summary.truncatedReason ?? "").toMatch(/sitemap-declared/i);
    expect(summary.truncatedReason ?? "").not.toMatch(/degrad/i); // distinct from backpressure
    // A truncated run is never a clean green — the lone fetched homepage would
    // otherwise score "ready"; the verdict floor downgrades it.
    expect(summary.verdict).not.toBe("ready");
  });

  it("(A) flags coverage when child sitemaps in an index are unreachable", async () => {
    install((p) => {
      if (p === "/robots.txt") return { body: `Sitemap: ${BASE}/sitemap_index.xml\n`, contentType: "text/plain" };
      if (p === "/sitemap_index.xml") return { body: sitemapindex([`${BASE}/c1.xml`, `${BASE}/c2.xml`, `${BASE}/c3.xml`]), contentType: "application/xml" };
      if (p === "/c1.xml") return { body: urlset([`${BASE}/a`, `${BASE}/b`]), contentType: "application/xml" };
      if (p === "/") return { body: html("Home") };
      // c2.xml + c3.xml 404 → 2 of 3 child sitemaps unreachable; /a,/b are pages.
      return p.startsWith("/c") ? null : { body: html(p) };
    });
    const summary = await auditSource(BASE, { backpressure: false });
    expect(summary.truncated).toBe(true);
    expect(summary.truncatedKind).toBe("coverage");
    expect(summary.truncatedReason ?? "").toMatch(/child sitemaps/i);
  });

  it("does NOT flag when discovery reaches the declared corpus (healthy)", async () => {
    install((p) => {
      if (p === "/robots.txt") return { body: `Sitemap: ${BASE}/sitemap.xml\n`, contentType: "text/plain" };
      if (p === "/sitemap.xml") return { body: urlset(declared), contentType: "application/xml" };
      return { body: html(p) }; // homepage + all declared pages 200
    });
    const summary = await auditSource(BASE, { backpressure: false });
    expect(summary.truncated).toBeFalsy();
  });

  it("does NOT flag when declared pages are reached but legitimately noindex", async () => {
    install((p) => {
      if (p === "/robots.txt") return { body: `Sitemap: ${BASE}/sitemap.xml\n`, contentType: "text/plain" };
      if (p === "/sitemap.xml") return { body: urlset(declared), contentType: "application/xml" };
      if (p === "/") return { body: html("Home") };
      return { body: html(p, { noindex: true }) }; // all reached (200), just noindex
    });
    const summary = await auditSource(BASE, { backpressure: false });
    expect(summary.truncated).toBeFalsy();
  });

  it("does NOT flag when an intentional crawl cap (not discovery) limits coverage", async () => {
    install((p) => {
      if (p === "/robots.txt") return { body: `Sitemap: ${BASE}/sitemap.xml\n`, contentType: "text/plain" };
      if (p === "/sitemap.xml") return { body: urlset(declared), contentType: "application/xml" };
      return { body: html(p) };
    });
    // Tiny crawl cap, no sampling → intended < 20 → operator's choice, not under-discovery.
    const summary = await auditSource(BASE, { backpressure: false, sampleSize: 0, maxCrawlDiscovered: 8 });
    expect(summary.truncated).toBeFalsy();
  });
});
