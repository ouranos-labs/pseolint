import { describe, expect, test } from "vitest";
import { commonPhraseReuseRule } from "../../../src/rules/content/common-phrase-reuse.js";
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
    resolvedHrefs: [],
    structureSignature: "",
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText,
    html: "",
  };
}

describe("commonPhraseReuseRule", () => {
  test("page with 0 clichés — no finding", () => {
    const p = page("https://example.com/good", "This is substantive content about specific topics with real data.");
    expect(commonPhraseReuseRule([p])).toHaveLength(0);
  });

  test("page with 2 clichés — no finding (below threshold)", () => {
    const p = page("https://example.com/two", "Located in the heart of downtown. Handpicked selection of local venues.");
    expect(commonPhraseReuseRule([p])).toHaveLength(0);
  });

  test("page with exactly 3 clichés — 1 finding, severity warning, confidence low", () => {
    const p = page(
      "https://example.com/three",
      "Located in the heart of the city. This is a hidden gem. We are the leading provider of services.",
    );
    const results = commonPhraseReuseRule([p]);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warning");
    expect(results[0].confidence).toBe("low");
    expect(results[0].ruleId).toBe("content/common-phrase-reuse");
    expect(results[0].pageUrl).toBe("https://example.com/three");
  });

  test("page with 6+ clichés — 1 finding, message lists at least 3 example phrases", () => {
    const p = page(
      "https://example.com/many",
      [
        "in the heart of the city,",
        "a hidden gem,",
        "discover the best options,",
        "trusted by thousands of customers,",
        "a comprehensive guide to everything,",
        "experts agree this is the best choice,",
        "wide variety of options available.",
      ].join(" "),
    );
    const results = commonPhraseReuseRule([p]);
    expect(results).toHaveLength(1);
    // Message should include the count and at least 3 examples in quotes
    const msg = results[0].message;
    const quotedPhrases = msg.match(/"[^"]+"/g) ?? [];
    expect(quotedPhrases.length).toBeGreaterThanOrEqual(3);
    // The page has 7 matching phrases (> 6)
    expect(parseInt(msg.match(/reuses (\d+)/)?.[1] ?? "0", 10)).toBeGreaterThanOrEqual(6);
  });

  test("case-insensitive matching — 'In The Heart Of' matches phrase", () => {
    const p = page(
      "https://example.com/case",
      "In The Heart Of the downtown area, this Hidden Gem is a Must-See attraction.",
    );
    const results = commonPhraseReuseRule([p]);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warning");
  });

  test("overlapping phrases each count separately if distinct", () => {
    // "right in the heart of" and "in the heart of" are separate phrases in the corpus
    // Both should match independently
    const p = page(
      "https://example.com/overlap",
      "This property is right in the heart of the city. It is in the heart of everything. World-class amenities await.",
    );
    const results = commonPhraseReuseRule([p]);
    // "right in the heart of", "in the heart of", "world-class" = 3 distinct phrases
    expect(results).toHaveLength(1);
  });

  test("empty contentText — no finding, no error", () => {
    const p = page("https://example.com/empty", "");
    expect(commonPhraseReuseRule([p])).toHaveLength(0);
  });

  test("undefined-like contentText (empty page) — no finding", () => {
    const p = page("https://example.com/notext", "");
    expect(commonPhraseReuseRule([p])).toHaveLength(0);
  });

  test("fix message references SpamBrain and ≤2 target", () => {
    const p = page(
      "https://example.com/fix",
      "in the heart of the city, hidden gem, discover the best things to do.",
    );
    const results = commonPhraseReuseRule([p]);
    expect(results[0].fix).toContain("SpamBrain");
    expect(results[0].fix).toContain("≤2");
  });

  test("clichés inside quoted-example regions (code/blockquote/[data-example]) are excluded", () => {
    // An explainer page that QUOTES clichés to teach about them should not be
    // flagged for its own examples. Same phrases in flowing prose still fire.
    const examplesOnly: ParsedPage = {
      ...page("https://pseolint.dev/rules/common-phrase-reuse", ""),
      html:
        "<body><main><h1>Common phrase reuse</h1>" +
        "<p>This rule flags overused marketing clichés.</p>" +
        '<blockquote data-example>in the heart of the city, a hidden gem, tucked away off the beaten path</blockquote>' +
        "<code>discover the best, trusted by thousands, world-class</code>" +
        "<pre>top rated, carefully curated, handpicked selection</pre>" +
        "</main></body>",
    };
    expect(commonPhraseReuseRule([examplesOnly])).toHaveLength(0);

    const inProse: ParsedPage = {
      ...page("https://spam.example/listing", ""),
      html:
        "<body><main><p>Located in the heart of downtown, this hidden gem is " +
        "tucked away and world-class.</p></main></body>",
    };
    const fired = commonPhraseReuseRule([inProse]);
    expect(fired).toHaveLength(1);
    expect(fired[0].pageUrl).toBe("https://spam.example/listing");
  });

  test("multiple pages — fires only on pages meeting threshold", () => {
    const good = page("https://example.com/good", "Specific, substantive content about pricing and features.");
    const bad = page(
      "https://example.com/bad",
      "Nestled between the hills, this hidden gem is a must-see. A comprehensive guide to everything you need.",
    );
    const results = commonPhraseReuseRule([good, bad]);
    expect(results).toHaveLength(1);
    expect(results[0].pageUrl).toBe("https://example.com/bad");
  });
});
