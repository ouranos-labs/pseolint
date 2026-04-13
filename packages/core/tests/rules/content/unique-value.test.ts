import { describe, expect, test } from "vitest";
import { uniqueValueRule } from "../../../src/rules/content/unique-value.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, contentText: string): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText,
    html: ""
  };
}

describe("uniqueValueRule", () => {
  test("counts unique words as distinct terms, not repeated occurrences", () => {
    const pages = [
      page("a", "alpha alpha alpha alpha"),
      page("b", "beta beta beta beta")
    ];

    const findings = uniqueValueRule(pages, 2);
    expect(findings.some((f) => f.ruleId === "content/unique-value")).toBe(true);
  });
});
