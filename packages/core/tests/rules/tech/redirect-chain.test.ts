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
  test("skips pages with no httpMeta", () => {
    const pages = [page("https://example.com/a")];
    const findings = redirectChainRule(pages);
    expect(findings).toHaveLength(0);
  });

  test("does not flag chain of 0 hops", () => {
    const pages = [
      page("https://example.com/a", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/a",
          redirectChain: [],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = redirectChainRule(pages);
    expect(findings).toHaveLength(0);
  });

  test("does not flag chain of 1 hop", () => {
    const pages = [
      page("https://example.com/a", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/final",
          redirectChain: ["https://example.com/hop1"],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = redirectChainRule(pages);
    expect(findings).toHaveLength(0);
  });

  test("does not flag chain of exactly 2 hops", () => {
    const pages = [
      page("https://example.com/a", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/final",
          redirectChain: ["https://example.com/hop1", "https://example.com/hop2"],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = redirectChainRule(pages);
    expect(findings).toHaveLength(0);
  });

  test("flags chain of 3 hops", () => {
    const pages = [
      page("https://example.com/a", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/final",
          redirectChain: [
            "https://example.com/hop1",
            "https://example.com/hop2",
            "https://example.com/hop3"
          ],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = redirectChainRule(pages);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("tech/redirect-chain");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].pageUrl).toBe("https://example.com/a");
    expect(findings[0].message).toContain("3-hop");
    expect(findings[0].message).toContain("https://example.com/final");
  });

  test("relatedUrls includes redirect chain hops and final url", () => {
    const chain = ["https://example.com/hop1", "https://example.com/hop2", "https://example.com/hop3"];
    const finalUrl = "https://example.com/final";
    const pages = [
      page("https://example.com/a", {
        httpMeta: {
          statusCode: 200,
          finalUrl,
          redirectChain: chain,
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = redirectChainRule(pages);
    expect(findings[0].relatedUrls).toEqual([...chain, finalUrl]);
  });

  test("fix message references the final URL", () => {
    const pages = [
      page("https://example.com/a", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/destination",
          redirectChain: ["h1", "h2", "h3"],
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = redirectChainRule(pages);
    expect(findings[0].fix).toContain("https://example.com/destination");
  });

  test("flags multiple pages with long chains independently", () => {
    const makeChain = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/hop${i + 1}`);
    const pages = [
      page("https://example.com/a", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/fa",
          redirectChain: makeChain(3),
          xRobotsTag: "",
          linkHeader: ""
        }
      }),
      page("https://example.com/b", {
        httpMeta: {
          statusCode: 200,
          finalUrl: "https://example.com/fb",
          redirectChain: makeChain(5),
          xRobotsTag: "",
          linkHeader: ""
        }
      })
    ];
    const findings = redirectChainRule(pages);
    expect(findings).toHaveLength(2);
  });
});
