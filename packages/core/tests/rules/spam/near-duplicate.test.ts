import { describe, expect, test } from "vitest";
import { nearDuplicateRule } from "../../../src/rules/spam/near-duplicate.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, contentText: string): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [], structureSignature: "", contentText, html: "",
  };
}

const LOREM =
  "The quick brown fox jumps over the lazy dog while the industrious bee gathers nectar from a thousand summer flowers in the meadow.";
const DIFFERENT =
  "Quarterly revenue rose as enterprise customers expanded seat counts; gross margin held steady despite higher cloud-infrastructure spend this period.";

describe("nearDuplicateRule", () => {
  test("flags two identical pages as a critical near-duplicate pair", () => {
    const pages = [page("https://s/a", LOREM), page("https://s/b", LOREM)];
    const { findings, pairs } = nearDuplicateRule(pages, 0.85);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].similarity).toBeCloseTo(1, 5);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("spam/near-duplicate");
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].pageUrl).toBe("https://s/a");
    expect(findings[0].relatedUrls).toEqual(["https://s/b"]);
  });

  test("does not flag clearly different content at the 0.85 threshold", () => {
    const pages = [page("https://s/a", LOREM), page("https://s/b", DIFFERENT)];
    const { findings, pairs } = nearDuplicateRule(pages, 0.85);
    expect(pairs).toEqual([]);
    expect(findings).toEqual([]);
  });

  test("reports every duplicate pair across three identical pages (n choose 2)", () => {
    const pages = [
      page("https://s/a", LOREM),
      page("https://s/b", LOREM),
      page("https://s/c", LOREM),
    ];
    const { pairs } = nearDuplicateRule(pages, 0.85);
    expect(pairs).toHaveLength(3); // a-b, a-c, b-c
  });

  test("a single page yields no pairs", () => {
    expect(nearDuplicateRule([page("https://s/a", LOREM)], 0.85).pairs).toEqual([]);
  });
});
