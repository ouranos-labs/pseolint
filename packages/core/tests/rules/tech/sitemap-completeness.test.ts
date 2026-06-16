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
  test("returns empty when sitemapUrls is empty", () => {
    const pages = [page("https://example.com/a"), page("https://example.com/b")];
    const findings = sitemapCompletenessRule(pages, new Set());
    expect(findings).toHaveLength(0);
  });

  test("flags pages missing from sitemap", () => {
    const pages = [
      page("https://example.com/a"),
      page("https://example.com/b"),
      page("https://example.com/c")
    ];
    const sitemapUrls = new Set(["https://example.com/a"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);

    const missingFinding = findings.find((f) => f.message.includes("not in sitemap"));
    expect(missingFinding).toBeDefined();
    expect(missingFinding!.severity).toBe("warning");
    expect(missingFinding!.ruleId).toBe("tech/sitemap-completeness");
    expect(missingFinding!.relatedUrls).toContain("https://example.com/b");
    expect(missingFinding!.relatedUrls).toContain("https://example.com/c");
    expect(missingFinding!.message).toContain("2 crawlable page(s)");
  });

  test("relatedUrls for missing pages are sorted", () => {
    const pages = [
      page("https://example.com/z"),
      page("https://example.com/a"),
      page("https://example.com/m")
    ];
    const sitemapUrls = new Set<string>();
    // All pages in sitemap should show sorted relatedUrls in missing finding
    const findings = sitemapCompletenessRule(pages, new Set(["https://example.com/z"]));
    const missingFinding = findings.find((f) => f.message.includes("not in sitemap"));
    expect(missingFinding!.relatedUrls).toEqual(
      [...missingFinding!.relatedUrls!].sort()
    );
  });

  test("flags sitemap URL returning 4xx status", () => {
    const pages = [
      page("https://example.com/gone", {
        httpMeta: {
          statusCode: 404,
          finalUrl: "https://example.com/gone",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const sitemapUrls = new Set(["https://example.com/gone"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);

    const errorFinding = findings.find((f) => f.message.includes("HTTP 404"));
    expect(errorFinding).toBeDefined();
    expect(errorFinding!.severity).toBe("error");
    expect(errorFinding!.pageUrl).toBe("https://example.com/gone");
    expect(errorFinding!.ruleId).toBe("tech/sitemap-completeness");
  });

  test("flags sitemap URL returning 5xx status", () => {
    const pages = [
      page("https://example.com/broken", {
        httpMeta: {
          statusCode: 500,
          finalUrl: "https://example.com/broken",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const sitemapUrls = new Set(["https://example.com/broken"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);

    expect(findings.some((f) => f.message.includes("HTTP 500"))).toBe(true);
  });

  test("flags sitemap URL that redirects", () => {
    const pages = [
      page("https://example.com/old", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/new",
          redirectChain: ["https://example.com/old"],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const sitemapUrls = new Set(["https://example.com/old"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);

    const redirectFinding = findings.find((f) => f.message.includes("redirects to"));
    expect(redirectFinding).toBeDefined();
    expect(redirectFinding!.severity).toBe("warning");
    expect(redirectFinding!.pageUrl).toBe("https://example.com/old");
    expect(redirectFinding!.relatedUrls).toContain("https://example.com/new");
    expect(redirectFinding!.fix).toContain("https://example.com/new");
  });

  test("does not flag redirect when finalUrl equals page url", () => {
    const pages = [
      page("https://example.com/same", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/same",
          redirectChain: ["https://example.com/same"],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const sitemapUrls = new Set(["https://example.com/same"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);

    expect(findings.every((f) => !f.message.includes("redirects to"))).toBe(true);
  });

  test("clean sitemap with all pages present and HTTP 200 returns no findings", () => {
    const pages = [
      page("https://example.com/a", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/a",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      }),
      page("https://example.com/b", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/b",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const sitemapUrls = new Set(["https://example.com/a", "https://example.com/b"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);
    expect(findings).toHaveLength(0);
  });

  test("does not check httpMeta for pages not in sitemap", () => {
    const pages = [
      page("https://example.com/not-in-sitemap", {
        httpMeta: {
          statusCode: 404,
          finalUrl: "https://example.com/not-in-sitemap",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const sitemapUrls = new Set(["https://example.com/other"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);

    // Should have a missing-from-sitemap finding but NOT a 404 finding
    expect(findings.every((f) => !f.message.includes("HTTP 404"))).toBe(true);
  });

  // FLAW 1: URL-normalization mismatch — page URLs are normalized (trailing slash
  // stripped), but raw sitemap URLs keep their trailing slash → false "missing".
  test("no false positive when sitemap uses trailing slashes but page URLs are normalized", () => {
    // page.url is already normalized (no trailing slash), sitemap has trailing slash
    const pages = [
      page("https://example.com/a"),
      page("https://example.com/b")
    ];
    const sitemapUrls = new Set([
      "https://example.com/a/",
      "https://example.com/b/"
    ]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);
    const missingFinding = findings.find((f) => f.message.includes("not in sitemap"));
    expect(missingFinding).toBeUndefined();
  });

  test("no false positive when sitemap URLs have query strings that pages have stripped", () => {
    const pages = [page("https://example.com/product")];
    const sitemapUrls = new Set(["https://example.com/product?ref=xml"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);
    const missingFinding = findings.find((f) => f.message.includes("not in sitemap"));
    expect(missingFinding).toBeUndefined();
  });

  // FLAW 2: severity should be "warning" (not "error") when sampled=true
  test("missing-from-sitemap is warning on sampled crawl", () => {
    const pages = [
      page("https://example.com/a"),
      page("https://example.com/b")
    ];
    const sitemapUrls = new Set(["https://example.com/a"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls, { sampled: true });
    const missingFinding = findings.find((f) => f.message.includes("not in sitemap"));
    expect(missingFinding).toBeDefined();
    expect(missingFinding!.severity).toBe("warning");
  });

  test("missing-from-sitemap is warning (not error) on non-sampled crawl", () => {
    const pages = [
      page("https://example.com/a"),
      page("https://example.com/b")
    ];
    const sitemapUrls = new Set(["https://example.com/a"]);
    const findings = sitemapCompletenessRule(pages, sitemapUrls);
    const missingFinding = findings.find((f) => f.message.includes("not in sitemap"));
    expect(missingFinding).toBeDefined();
    expect(missingFinding!.severity).toBe("warning");
  });

  test("4xx-in-sitemap sub-check remains error regardless of sampled flag", () => {
    const pages = [
      page("https://example.com/gone", {
        httpMeta: {
          statusCode: 404,
          finalUrl: "https://example.com/gone",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const sitemapUrls = new Set(["https://example.com/gone"]);
    const findingsFull = sitemapCompletenessRule(pages, sitemapUrls, { sampled: false });
    const findingsSampled = sitemapCompletenessRule(pages, sitemapUrls, { sampled: true });
    expect(findingsFull.find((f) => f.message.includes("HTTP 404"))!.severity).toBe("error");
    expect(findingsSampled.find((f) => f.message.includes("HTTP 404"))!.severity).toBe("error");
  });
});
