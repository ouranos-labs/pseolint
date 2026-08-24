import { describe, expect, test } from "vitest";
import { keywordStuffedTitleRule } from "../../../src/rules/spam/keyword-stuffed-title.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, title: string): ParsedPage {
  return {
    url, title, metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: "",
  };
}

function fires(title: string): boolean {
  return keywordStuffedTitleRule([page("https://example.dev/a", title)]).length === 1;
}

describe("keywordStuffedTitleRule", () => {
  test("fires on a title that is a list of query modifiers", () => {
    const findings = keywordStuffedTitleRule([
      page("https://example.dev/larray", "Larray - Height, Birthday, Age, TikTok, YouTube, Wiki, Bio"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("spam/keyword-stuffed-title");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("high");
    expect(findings[0].pageUrl).toBe("https://example.dev/larray");
  });

  test("fires on a local-directory title that chains entity, place and counts", () => {
    expect(fires("Regal Nails, Salon & Spa, Waterford, CT - Reviews (51), Photos (25) - BestProsInTown")).toBe(true);
  });

  test("does not fire on a phrase with a brand suffix, however long", () => {
    // 109 characters, and one of the reputable winners in the calibration corpus.
    expect(
      fires(
        "Free Customer Success Templates - Retain more customers with these customer success form and survey templates",
      ),
    ).toBe(false);
  });

  /**
   * The regression this rule must never become. The deleted 70-character
   * ceiling would have ranked these two the wrong way round; the shipped check
   * fires on the SHORTER of them, because it counts slots, not characters.
   */
  test("is not a length check: fires on a short list, ignores a long phrase", () => {
    const short = "A - Age, Wiki, Bio, Height, Kids";
    const long =
      "How to choose a mortgage lender when you are self-employed and have irregular income, explained";
    expect(short.length).toBeLessThan(long.length);
    expect(fires(short)).toBe(true);
    expect(fires(long)).toBe(false);
  });

  test("never mentions truncation or a character budget", () => {
    const [finding] = keywordStuffedTitleRule([
      page("https://example.dev/a", "A - Age, Wiki, Bio, Height, Kids"),
    ]);
    const text = `${finding.message} ${finding.fix ?? ""}`;
    expect(text).not.toMatch(/truncat/i);
    expect(text).not.toMatch(/\b(50|60|65|70|80)\s*(-|\s)?char/i);
    expect(text).not.toMatch(/\bcharacters?\b/i);
  });

  test("needs bare keywords, not just separators", () => {
    // Six slots, but each is a clause: an editorial subtitle, not a keyword list.
    expect(
      fires(
        "Making sourdough at home, proving the dough overnight, shaping the loaf, " +
          "scoring the crust, baking in a dutch oven, cooling before slicing",
      ),
    ).toBe(false);
  });

  test("does not fire below the slot floor", () => {
    expect(fires("Adalia Rose - Age, Wiki, Bio, Height")).toBe(false);
  });

  test("keeps hyphenated words and dash spellings inside their slot", () => {
    // "Step-by-Step" and "e-commerce" must not split into slots of their own.
    expect(fires("Step-by-Step e-commerce guide for first-time sellers")).toBe(false);
  });

  test("ignores pages with no title", () => {
    expect(keywordStuffedTitleRule([page("https://example.dev/a", "   ")])).toHaveLength(0);
  });
});
