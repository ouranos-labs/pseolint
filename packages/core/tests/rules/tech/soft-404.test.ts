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
  test("skips pages with no httpMeta", () => {
    const pages = [page("https://example.com/a", { title: "Page Not Found", contentText: "oops" })];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(0);
  });

  test("skips pages with non-200 status codes", () => {
    const pages = [
      page("https://example.com/a", {
        title: "Page Not Found",
        contentText: "oops",
        httpMeta: {
          statusCode: 404,
          finalUrl: "https://example.com/a",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(0);
  });

  test("skips pages with 50+ words of content even with error title", () => {
    const manyWords = Array.from({ length: 55 }, (_, i) => `word${i}`).join(" ");
    const pages = [
      page("https://example.com/a", {
        title: "Page Not Found",
        contentText: manyWords,
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/a",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(0);
  });

  test("flags HTTP 200 page with error title and sparse content", () => {
    const pages = [
      page("https://example.com/missing", {
        title: "Page Not Found",
        contentText: "Sorry, this page is gone.",
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/missing",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("tech/soft-404");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].pageUrl).toBe("https://example.com/missing");
    expect(findings[0].message).toContain("Page Not Found");
    expect(findings[0].message).toContain("HTTP 200");
  });

  test("flags title matching '404' pattern", () => {
    const pages = [
      page("https://example.com/err", {
        title: "404 Error",
        contentText: "Not here.",
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/err",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(1);
  });

  test("flags title matching 'page missing' pattern", () => {
    const pages = [
      page("https://example.com/err", {
        title: "Page Missing",
        contentText: "Oops.",
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/err",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(1);
  });

  test("flags title matching 'does not exist' pattern", () => {
    const pages = [
      page("https://example.com/err", {
        title: "This page does not exist",
        contentText: "Gone.",
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/err",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(1);
  });

  test("flags title matching 'no longer available' pattern", () => {
    const pages = [
      page("https://example.com/err", {
        title: "No Longer Available",
        contentText: "Sorry.",
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/err",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(1);
  });

  test("does not flag normal page with real content and unrelated title", () => {
    const realContent = Array.from({ length: 20 }, (_, i) => `word${i}`).join(" ");
    const pages = [
      page("https://example.com/real", {
        title: "How to bake a cake",
        contentText: realContent,
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/real",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(0);
  });

  test("does not flag page with real title but sparse content", () => {
    const pages = [
      page("https://example.com/stub", {
        title: "About Us",
        contentText: "Just a stub.",
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/stub",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings).toHaveLength(0);
  });

  test("message includes word count", () => {
    const pages = [
      page("https://example.com/err", {
        title: "Not Found",
        contentText: "only five words here.",
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/err",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = soft404Rule(pages);
    expect(findings[0].message).toMatch(/\d+ words/);
  });
});
