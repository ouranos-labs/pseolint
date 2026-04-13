import { describe, expect, test } from "vitest";
import { urlPatternRule } from "../../../src/rules/cannibal/url-pattern.js";
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

describe("urlPatternRule", () => {
  test("flags URLs with same tokens in different order in the same directory", () => {
    const pages = [
      page("https://example.com/templates/california-llc"),
      page("https://example.com/templates/llc-california")
    ];

    const findings = urlPatternRule(pages);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("cannibal/url-pattern");
    expect(findings[0].severity).toBe("info");
  });

  test("does not flag URLs in different directories", () => {
    const pages = [
      page("https://example.com/templates/california-llc"),
      page("https://example.com/guides/llc-california")
    ];

    const findings = urlPatternRule(pages);
    expect(findings.length).toBe(0);
  });

  test("does not flag URLs with different tokens", () => {
    const pages = [
      page("https://example.com/templates/california-llc"),
      page("https://example.com/templates/texas-corp")
    ];

    const findings = urlPatternRule(pages);
    expect(findings.length).toBe(0);
  });

  test("does not flag identical URLs", () => {
    const pages = [
      page("https://example.com/templates/california-llc"),
      page("https://example.com/templates/california-llc")
    ];

    const findings = urlPatternRule(pages);
    expect(findings.length).toBe(0);
  });
});
