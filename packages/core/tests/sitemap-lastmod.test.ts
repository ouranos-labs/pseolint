import { describe, it, expect } from "vitest";
import { parseSitemapUrlsWithLastmod } from "../src/auditor.js";

describe("parseSitemapUrlsWithLastmod", () => {
  it("extracts loc + optional lastmod for each <url>", () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc><lastmod>2026-05-01T00:00:00Z</lastmod></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`;
    const result = parseSitemapUrlsWithLastmod(xml);
    expect(result).toEqual([
      { url: "https://example.com/a", lastmod: "2026-05-01T00:00:00Z" },
      { url: "https://example.com/b", lastmod: undefined },
    ]);
  });

  it("returns empty array for sitemap with no <url> entries", () => {
    expect(parseSitemapUrlsWithLastmod("<urlset></urlset>")).toEqual([]);
  });

  it("trims whitespace from loc and lastmod values", () => {
    const xml = `<urlset>
  <url>
    <loc>  https://example.com/x  </loc>
    <lastmod>  2026-05-01  </lastmod>
  </url>
</urlset>`;
    expect(parseSitemapUrlsWithLastmod(xml)).toEqual([
      { url: "https://example.com/x", lastmod: "2026-05-01" },
    ]);
  });

  it("skips <url> entries with empty loc", () => {
    const xml = `<urlset>
  <url><loc></loc><lastmod>2026-05-01</lastmod></url>
  <url><loc>https://example.com/a</loc></url>
</urlset>`;
    expect(parseSitemapUrlsWithLastmod(xml)).toEqual([
      { url: "https://example.com/a", lastmod: undefined },
    ]);
  });
});
