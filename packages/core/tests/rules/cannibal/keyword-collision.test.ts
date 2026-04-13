import { describe, expect, test } from "vitest";
import { keywordCollisionRule } from "../../../src/rules/cannibal/keyword-collision.js";
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

describe("keywordCollisionRule", () => {
  test("flags pages sharing many top keywords", () => {
    const sharedContent = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
    const pages = [
      page("https://example.com/a", { contentText: `${sharedContent} unique1a unique2a` }),
      page("https://example.com/b", { contentText: `${sharedContent} unique1b unique2b` }),
      page("https://example.com/c", { contentText: "completely different words about baking sourdough bread crust oven yeast flour water salt" })
    ];

    const findings = keywordCollisionRule(pages, 6);
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings[0].ruleId).toBe("cannibal/keyword-collision");
    expect(findings[0].severity).toBe("warning");
  });

  test("does not flag pages with distinct content", () => {
    const pages = [
      page("https://example.com/a", { contentText: "alpha beta gamma delta epsilon zeta eta theta iota kappa" }),
      page("https://example.com/b", { contentText: "one two three four five six seven eight nine ten" })
    ];

    const findings = keywordCollisionRule(pages, 6);
    expect(findings.length).toBe(0);
  });

  test("respects custom minShared parameter", () => {
    const sharedContent = "alpha beta gamma delta epsilon";
    const pages = [
      page("https://example.com/a", { contentText: `${sharedContent} unique1 unique2 unique3 unique4 unique5` }),
      page("https://example.com/b", { contentText: `${sharedContent} other1 other2 other3 other4 other5` }),
      page("https://example.com/c", { contentText: "completely different words about baking sourdough bread crust oven yeast" })
    ];

    const strict = keywordCollisionRule(pages, 8);
    expect(strict.length).toBe(0);

    const loose = keywordCollisionRule(pages, 2);
    expect(loose.length).toBeGreaterThanOrEqual(1);
  });
});
