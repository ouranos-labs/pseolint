import { afterEach, describe, expect, test } from "vitest";
import {
  parseDisallowPatterns,
  parseSitemapDirectives,
  robotsSitemapPresenceRule,
} from "../../../src/rules/tech/robots-sitemap-presence.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("robotsSitemapPresenceRule", () => {
  test("returns empty for local filesystem source", async () => {
    const findings = await robotsSitemapPresenceRule("D:/tmp/site");
    expect(findings).toEqual([]);
  });

  test("warns when robots and sitemap are unavailable", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 404 })) as typeof fetch;
    const findings = await robotsSitemapPresenceRule("https://example.dev/page");
    expect(findings.some((f) => f.message.includes("robots.txt"))).toBe(true);
  });

  test("reports missing sitemap directive when robots exists", async () => {
    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nDisallow:", { status: 200 });
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response("<urlset></urlset>", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const findings = await robotsSitemapPresenceRule("https://example.dev/page");
    expect(findings.some((f) => f.message.includes("does not declare a Sitemap"))).toBe(true);
  });
});

describe("parseDisallowPatterns (UA-specific merging)", () => {
  test("default (no UA arg) reads only the wildcard block: legacy behavior", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /admin",
      "",
      "User-agent: pseolint",
      "Disallow: /",
    ].join("\n");
    // Default UA list is ["*"]; pseolint-specific Disallow is IGNORED.
    expect(parseDisallowPatterns(robots)).toEqual(["/admin"]);
  });

  test("merges a named UA block with the wildcard block", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /admin",
      "",
      "User-agent: pseolint",
      "Disallow: /",
    ].join("\n");
    const merged = parseDisallowPatterns(robots, ["*", "pseolint"]);
    expect(merged).toEqual(expect.arrayContaining(["/admin", "/"]));
  });

  test("honors a named UA block when the wildcard block is absent", () => {
    const robots = "User-agent: pseolint\nDisallow: /\n";
    // This was the v0.3.2 gap: targeted Disallow without a wildcard silently
    // bypassed the crawler. After the fix it's honored when the UA is passed.
    expect(parseDisallowPatterns(robots, ["*", "pseolint"])).toEqual(["/"]);
  });

  test("matching is case-insensitive on the UA name", () => {
    const robots = "User-agent: PSEOLINT\nDisallow: /private\n";
    expect(parseDisallowPatterns(robots, ["pseolint"])).toEqual(["/private"]);
  });
});

describe("parseSitemapDirectives", () => {
  test("returns empty array when no Sitemap directive present", () => {
    const robots = "User-agent: *\nDisallow: /private\n";
    expect(parseSitemapDirectives(robots)).toEqual([]);
  });

  test("parses a single Sitemap directive", () => {
    const robots = "User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml\n";
    expect(parseSitemapDirectives(robots)).toEqual(["https://example.com/sitemap.xml"]);
  });

  test("parses multiple Sitemap directives", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /admin",
      "Sitemap: https://example.com/sitemap-pages.xml",
      "Sitemap: https://example.com/sitemap-posts.xml",
      "Sitemap: https://example.com/sitemap-products.xml",
    ].join("\n");
    expect(parseSitemapDirectives(robots)).toEqual([
      "https://example.com/sitemap-pages.xml",
      "https://example.com/sitemap-posts.xml",
      "https://example.com/sitemap-products.xml",
    ]);
  });

  test("is case-insensitive for the Sitemap keyword", () => {
    const robots = "sitemap: https://example.com/sm1.xml\nSITEMAP: https://example.com/sm2.xml\n";
    expect(parseSitemapDirectives(robots)).toEqual([
      "https://example.com/sm1.xml",
      "https://example.com/sm2.xml",
    ]);
  });

  test("skips comment lines and blank lines", () => {
    const robots = [
      "# This is a comment",
      "",
      "User-agent: *",
      "Disallow:",
      "# Sitemap: https://example.com/not-a-real-directive.xml",
      "Sitemap: https://example.com/real-sitemap.xml",
      "",
    ].join("\n");
    expect(parseSitemapDirectives(robots)).toEqual(["https://example.com/real-sitemap.xml"]);
  });

  test("strips leading and trailing whitespace from the URL value", () => {
    const robots = "Sitemap:   https://example.com/sitemap.xml   \n";
    expect(parseSitemapDirectives(robots)).toEqual(["https://example.com/sitemap.xml"]);
  });

  test("returns empty array for empty robots.txt string", () => {
    expect(parseSitemapDirectives("")).toEqual([]);
  });

  test("handles CRLF line endings", () => {
    const robots = "User-agent: *\r\nDisallow:\r\nSitemap: https://example.com/sitemap.xml\r\n";
    expect(parseSitemapDirectives(robots)).toEqual(["https://example.com/sitemap.xml"]);
  });
});
