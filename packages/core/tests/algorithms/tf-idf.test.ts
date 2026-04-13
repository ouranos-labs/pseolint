import { describe, expect, test } from "vitest";
import { extractKeywords } from "../../src/algorithms/tf-idf.js";

describe("extractKeywords", () => {
  test("returns top keywords by TF-IDF score", () => {
    const texts = [
      "california llc filing requirements and annual fees for california businesses",
      "texas llc formation guide with texas specific regulations",
      "how to bake sourdough bread with a perfect crust every time"
    ];

    const keywords = extractKeywords(texts[0], texts, 3);
    expect(keywords.length).toBe(3);
    expect(keywords).toContain("california");
    expect(keywords).toContain("filing");
  });

  test("returns empty array for empty text", () => {
    const keywords = extractKeywords("", ["some text", ""], 5);
    expect(keywords).toEqual([]);
  });

  test("ranks unique words higher than common words", () => {
    const texts = [
      "filing requirements unique specific",
      "formation guide general broad",
      "registration steps process method"
    ];

    const keywords = extractKeywords(texts[0], texts, 2);
    expect(keywords).toContain("filing");
    expect(keywords).toContain("requirements");
  });

  test("respects topN limit", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta";
    const keywords = extractKeywords(text, [text, "unrelated words here"], 3);
    expect(keywords.length).toBe(3);
  });
});
