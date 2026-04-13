import { describe, expect, test } from "vitest";
import { templateCoverageRule } from "../../../src/rules/spam/template-coverage.js";
import type { EntityMaskPattern, ParsedPage } from "../../../src/types.js";

function page(url: string): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: ""
  };
}

const patterns: EntityMaskPattern[] = [
  { placeholder: "[STATE]", pattern: /\b(california|nevada|texas|florida|ohio|georgia)\b/gi }
];

describe("templateCoverageRule", () => {
  test("detects template dimensions from URL patterns", () => {
    const pages = [
      page("https://example.com/templates/consultant-bill-of-sale-california"),
      page("https://example.com/templates/consultant-bill-of-sale-nevada"),
      page("https://example.com/templates/consultant-lease-agreement-california"),
      page("https://example.com/templates/owner-bill-of-sale-california"),
      page("https://example.com/templates/owner-bill-of-sale-nevada"),
    ];
    const findings = templateCoverageRule(pages, patterns, 5);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("spam/template-coverage");
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("dimensions");
    expect(findings[0].message).toContain("Coverage");
  });

  test("skips directories with fewer than minPages", () => {
    const pages = [
      page("https://example.com/templates/a-b-california"),
      page("https://example.com/templates/a-b-nevada"),
    ];
    expect(templateCoverageRule(pages, patterns, 5)).toHaveLength(0);
  });

  test("skips when no template pattern detected", () => {
    const pages = [
      page("https://example.com/blog/my-first-post"),
      page("https://example.com/blog/another-topic"),
      page("https://example.com/blog/something-else"),
      page("https://example.com/blog/random-article"),
      page("https://example.com/blog/final-thoughts"),
    ];
    expect(templateCoverageRule(pages, patterns, 5)).toHaveLength(0);
  });

  test("handles filesystem paths", () => {
    const pages = [
      page("D:\\site\\templates\\consultant-bill-california.html"),
      page("D:\\site\\templates\\consultant-bill-nevada.html"),
      page("D:\\site\\templates\\consultant-lease-california.html"),
      page("D:\\site\\templates\\owner-bill-california.html"),
      page("D:\\site\\templates\\owner-bill-nevada.html"),
    ];
    const findings = templateCoverageRule(pages, patterns, 5);
    expect(findings.length).toBe(1);
  });
});
