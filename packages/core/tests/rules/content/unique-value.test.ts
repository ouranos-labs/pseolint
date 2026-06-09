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

  test("fix guidance is axis-aware and names the shared-word overlap (#3)", () => {
    // Two sibling pages: a large SHARED block (axis-shared, repeated verbatim)
    // plus a tiny page-specific tail. The shared words must not count, and the
    // guidance must warn about exactly that so authors don't add more shared text.
    const shared = "shared legal boilerplate clause provision regulation statute licensing insurance requirement";
    const pages = [
      page("a", `${shared} alphaonly`),
      page("b", `${shared} betaonly`)
    ];

    const findings = uniqueValueRule(pages, 5);
    const f = findings.find((x) => x.pageUrl === "a");
    expect(f).toBeDefined();
    // Message surfaces the shared overlap, not just a bare unique count.
    expect(f!.message).toMatch(/also appear on other pages/);
    // Fix explicitly warns that axis-shared / repeated content does not count.
    expect(f!.fix).toMatch(/does NOT count/i);
    expect(f!.fix).toMatch(/no other page/i);
  });

  test("normalizes surrounding punctuation so 'word' and 'word.' are one token", () => {
    // "shared" appears on both pages but with different trailing punctuation; it
    // must count as SHARED on each (not spuriously unique). Without tokenization
    // normalization each page would show 2 unique words instead of 1.
    const pages = [
      page("a", "shared, alphaonly"),
      page("b", "shared. betaonly")
    ];
    const findings = uniqueValueRule(pages, 5);
    const fa = findings.find((x) => x.pageUrl === "a");
    expect(fa).toBeDefined();
    expect(fa!.message).toMatch(/only 1 page-unique words/);
  });
});
