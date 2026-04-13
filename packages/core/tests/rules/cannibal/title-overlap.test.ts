import { describe, expect, test } from "vitest";
import { titleOverlapRule } from "../../../src/rules/cannibal/title-overlap.js";
import type { EntityMaskPattern, ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: "", ...overrides
  };
}

const patterns: EntityMaskPattern[] = [
  {
    placeholder: "[STATE]",
    pattern: /\b(California|Texas|Florida)\b/gi
  }
];

describe("titleOverlapRule", () => {
  test("flags pages with overlapping titles after entity masking", () => {
    const pages = [
      page("https://example.com/california-llc", { title: "How to Form an LLC in California" }),
      page("https://example.com/texas-llc", { title: "How to Form an LLC in Texas" })
    ];

    const findings = titleOverlapRule(pages, patterns, 0.8);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("cannibal/title-overlap");
    expect(findings[0].severity).toBe("warning");
  });

  test("does not flag pages with different titles", () => {
    const pages = [
      page("https://example.com/llc-guide", { title: "How to Form an LLC" }),
      page("https://example.com/bread-recipe", { title: "Sourdough Bread Recipe" })
    ];

    const findings = titleOverlapRule(pages, patterns, 0.8);
    expect(findings.length).toBe(0);
  });

  test("respects custom threshold", () => {
    const pages = [
      page("https://example.com/a", { title: "Best LLC Formation Services" }),
      page("https://example.com/b", { title: "Best LLC Registration Services" })
    ];

    const strict = titleOverlapRule(pages, [], 0.95);
    expect(strict.length).toBe(0);

    const loose = titleOverlapRule(pages, [], 0.4);
    expect(loose.length).toBe(1);
  });
});
