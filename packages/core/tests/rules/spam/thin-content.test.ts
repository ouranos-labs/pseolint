import { describe, expect, test } from "vitest";
import { thinContentRule } from "../../../src/rules/spam/thin-content.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, contentText: string): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText, html: "",
  };
}

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
}

describe("thinContentRule", () => {
  test("does not fire when word count meets threshold", () => {
    const { findings, thinContentUrls } = thinContentRule([page("https://example.dev/a", words(300))], 300);
    expect(findings).toHaveLength(0);
    expect(thinContentUrls.size).toBe(0);
  });

  test("emits high confidence when word count is far below threshold (< 50%)", () => {
    // Threshold 300, content 50 words → 50/300 < 50% → high.
    const { findings, thinContentUrls } = thinContentRule([page("https://example.dev/a", words(50))], 300);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].confidence).toBe("high");
    expect(thinContentUrls.has("https://example.dev/a")).toBe(true);
    // High-confidence finding does NOT include the legitimately-short caveat.
    expect(findings[0].message).not.toMatch(/legitimately short/i);
  });

  test("emits medium confidence when word count is just under threshold", () => {
    // Threshold 300, content 200 words → 200/300 = 66% → medium.
    const { findings } = thinContentRule([page("https://example.dev/a", words(200))], 300);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].confidence).toBe("medium");
    // Medium-confidence finding includes the short-page-types caveat.
    expect(findings[0].message).toMatch(/legitimately short/i);
  });

  test("uses the word-count number in the message", () => {
    const { findings } = thinContentRule([page("https://example.dev/a", words(7))], 300);
    expect(findings[0].message).toMatch(/7 words/);
  });
});
