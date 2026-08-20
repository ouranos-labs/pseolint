import { afterEach, describe, expect, it, vi } from "vitest";
import { auditSource } from "../../src/auditor.js";

/**
 * Sitemap-first discovery: a homepage audit should read the site's declared
 * sitemap(s): via robots.txt `Sitemap:` or a /sitemap.xml probe, and audit
 * those URLs even when they are NOT reachable by following links from the
 * homepage. This is the "build-frozen / sparsely-linked programmatic site"
 * case the real dogfood hit. Falls back to link-crawl when no sitemap exists.
 */

const BASE = "http://localhost:9991";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function html(title: string, links: string[] = []): string {
  const anchors = links.map((l) => `<a href="${l}">link</a>`).join("");
  return `<!doctype html><html><head><title>${title}</title></head><body><h1>${title}</h1>${anchors}<p>${"unique content words here ".repeat(40)}</p></body></html>`;
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
    const u = typeof input === "string" ? input : input.toString();
    const pathname = new URL(u).pathname;
    const r = handler(pathname);
    if (!r) return new Response("", { status: 404 });
    return new Response(r.body, {
      status: r.status ?? 200,
      headers: { "content-type": r.contentType ?? "text/html" },
    });
  }) as typeof fetch;
}

async function auditedPaths(source: string): Promise<string[]> {
  const summary = await auditSource(source, { backpressure: false });
  return (summary.auditedUrls ?? []).map((u) => {
    try {
      return new URL(u).pathname;
    } catch {
      return u;
    }
  });
}

describe("sitemap-first discovery", () => {
  it("audits unlinked URLs declared via a robots.txt Sitemap: directive", async () => {
    install((p) => {
      if (p === "/robots.txt") return { body: `User-agent: *\nSitemap: ${BASE}/sitemap.xml\n`, contentType: "text/plain" };
      if (p === "/sitemap.xml") return { body: urlset([`${BASE}/sm-a`, `${BASE}/sm-b`]), contentType: "application/xml" };
      if (p === "/") return { body: html("Home", ["/linked"]) };
      return { body: html(p) };
    });
    const paths = await auditedPaths(BASE);
    // The two sitemap-only URLs (never linked from the homepage) were found.
    expect(paths).toContain("/sm-a");
    expect(paths).toContain("/sm-b");
    // Link-crawl still works alongside it.
    expect(paths).toContain("/linked");
  });

  it("probes /sitemap.xml when robots.txt declares no sitemap", async () => {
    install((p) => {
      if (p === "/robots.txt") return { body: "User-agent: *\nDisallow:\n", contentType: "text/plain" };
      if (p === "/sitemap.xml") return { body: urlset([`${BASE}/probed-1`, `${BASE}/probed-2`]), contentType: "application/xml" };
      if (p === "/") return { body: html("Home") };
      return { body: html(p) };
    });
    const paths = await auditedPaths(BASE);
    expect(paths).toContain("/probed-1");
    expect(paths).toContain("/probed-2");
  });

  it("follows a nested <sitemapindex> discovered from robots.txt", async () => {
    install((p) => {
      if (p === "/robots.txt") return { body: `Sitemap: ${BASE}/sitemap_index.xml\n`, contentType: "text/plain" };
      if (p === "/sitemap_index.xml") return { body: sitemapindex([`${BASE}/child.xml`]), contentType: "application/xml" };
      if (p === "/child.xml") return { body: urlset([`${BASE}/nested-1`, `${BASE}/nested-2`]), contentType: "application/xml" };
      if (p === "/") return { body: html("Home") };
      return { body: html(p) };
    });
    const paths = await auditedPaths(BASE);
    expect(paths).toContain("/nested-1");
    expect(paths).toContain("/nested-2");
  });

  it("falls back to link-crawl (and does not crash) when no sitemap exists", async () => {
    install((p) => {
      // robots + both probe paths 404 → no sitemap anywhere.
      if (p === "/robots.txt" || p === "/sitemap.xml" || p === "/sitemap_index.xml") return null;
      if (p === "/") return { body: html("Home", ["/only-linked"]) };
      return { body: html(p) };
    });
    const paths = await auditedPaths(BASE);
    expect(paths).toContain("/only-linked"); // link-crawl unchanged
    expect(paths).toContain("/"); // homepage itself
  });
});
