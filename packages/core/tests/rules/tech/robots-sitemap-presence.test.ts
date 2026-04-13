import { afterEach, describe, expect, test } from "vitest";
import { robotsSitemapPresenceRule } from "../../../src/rules/tech/robots-sitemap-presence.js";

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
