import { describe, it, expect } from "vitest";
import {
  validateRobotsTxt,
  validateSitemapXml,
  validateCanonicalStrategy,
  validateDomainPatch,
} from "../../../src/ai/manifest/validators/domain-patches.js";

describe("validateRobotsTxt", () => {
  it("accepts a minimal valid robots.txt", () => {
    const r = validateRobotsTxt({
      type: "robots_txt",
      before: null,
      after: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects empty", () => {
    const r = validateRobotsTxt({ type: "robots_txt", before: null, after: "  ", reason: "x" });
    expect(r.valid).toBe(false);
  });

  it("rejects unrecognized directives", () => {
    const r = validateRobotsTxt({
      type: "robots_txt",
      before: null,
      after: "User-agent: *\nDisalo: /\nAllow: /",
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("unrecognized");
  });

  it("rejects when no User-agent directive", () => {
    const r = validateRobotsTxt({
      type: "robots_txt",
      before: null,
      after: "Sitemap: https://example.com/sitemap.xml",
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("User-agent");
  });

  it("ignores comments and blank lines", () => {
    const r = validateRobotsTxt({
      type: "robots_txt",
      before: null,
      after: "# leading comment\n\nUser-agent: *\nAllow: /\n# trailing comment",
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });
});

describe("validateSitemapXml", () => {
  it("accepts a minimal urlset", () => {
    const xml = `<?xml version="1.0"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc></url>
  <url><loc>https://example.com/b</loc></url>
</urlset>`;
    const r = validateSitemapXml({ type: "sitemap_xml", before: null, after: xml, reason: "x" });
    expect(r.valid).toBe(true);
  });

  it("accepts a sitemap index", () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-1.xml</loc></sitemap>
</sitemapindex>`;
    const r = validateSitemapXml({ type: "sitemap_xml", before: null, after: xml, reason: "x" });
    expect(r.valid).toBe(true);
  });

  it("rejects missing root element", () => {
    const r = validateSitemapXml({
      type: "sitemap_xml",
      before: null,
      after: "<urls><url>x</url></urls>",
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects urlset with no <url> children", () => {
    const r = validateSitemapXml({
      type: "sitemap_xml",
      before: null,
      after: `<urlset></urlset>`,
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });

  it("rejects <url> missing <loc>", () => {
    const r = validateSitemapXml({
      type: "sitemap_xml",
      before: null,
      after: `<urlset><url><lastmod>2026-01-01</lastmod></url></urlset>`,
      reason: "x",
    });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain("loc");
  });

  it("rejects unclosed urlset tag", () => {
    const r = validateSitemapXml({
      type: "sitemap_xml",
      before: null,
      after: `<urlset><url><loc>https://example.com/a</loc></url>`,
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });
});

describe("validateCanonicalStrategy", () => {
  it("accepts a substantive strategy description", () => {
    const r = validateCanonicalStrategy({
      type: "canonical_strategy",
      before: null,
      after: "Always self-canonical except paginated views which canonicalize to page 1.",
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });

  it("rejects too short", () => {
    const r = validateCanonicalStrategy({
      type: "canonical_strategy",
      before: null,
      after: "use canonicals",
      reason: "x",
    });
    expect(r.valid).toBe(false);
  });
});

describe("validateDomainPatch dispatcher", () => {
  it("routes by patch type", () => {
    const r = validateDomainPatch({
      type: "robots_txt",
      before: null,
      after: "User-agent: *\nAllow: /",
      reason: "x",
    });
    expect(r.valid).toBe(true);
  });
});
