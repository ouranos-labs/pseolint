import { describe, expect, test } from "vitest";
import { entitySwapRule } from "../../../src/rules/spam/entity-swap.js";
import type { EntityMaskPattern, ParsedPage } from "../../../src/types.js";

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
    structureSignature: "default",
    contentText,
    html: "<html></html>",
  };
}

// Two pages whose text differs only by an entity (city name).
// After masking, they become identical → high-confidence entity-swap signal.
// The base template is long enough that SimHash produces near-identical hashes
// once the few entity tokens are masked out.
const BASE =
  "Find the best plumber near you. Our plumbers are licensed and insured. " +
  "Call today for fast service. Serving all surrounding areas. " +
  "We offer emergency repairs, pipe installation, water heater replacement, " +
  "drain cleaning, and leak detection. Free estimates. Satisfaction guaranteed. " +
  "Licensed bonded insured. Family owned and operated since 1998. " +
  "Available 24 hours a day 7 days a week. No job too big or too small. ";
const CITY_SENTENCE = "Proudly serving the CITY area.";
const pageAkron = page(
  "https://ex.com/plumber-akron",
  BASE + CITY_SENTENCE.replace("CITY", "Akron") + " " + BASE,
);
const pageToledo = page(
  "https://ex.com/plumber-toledo",
  BASE + CITY_SENTENCE.replace("CITY", "Toledo") + " " + BASE,
);

const goodPatterns: EntityMaskPattern[] = [
  { placeholder: "[CITY]", pattern: /Akron|Toledo|Columbus|Cleveland/i },
];

// Pages that are near-identical WITHOUT any entity substitution; they expose
// the degenerate case where empty patterns leave masking inert, turning the
// rule into a plain near-duplicate detector.
const DUPLICATE_TEXT =
  "Top rated SEO agency. We help businesses grow online. " +
  "Our team of experts delivers results. Contact us for a free consultation. " +
  "Proven strategies. Measurable outcomes. Dedicated account managers. " +
  "Monthly reporting. Transparent pricing. No long-term contracts. " +
  "Satisfied clients across many industries. Call now to get started today. ".repeat(3);
const pageDup1 = page("https://ex.com/seo-page-1", DUPLICATE_TEXT);
const pageDup2 = page("https://ex.com/seo-page-2", DUPLICATE_TEXT);

describe("spam/entity-swap", () => {
  test("(a) entity-swapped pages WITH good entity patterns → fires critical", () => {
    const { findings } = entitySwapRule([pageAkron, pageToledo], goodPatterns, 0.9);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("spam/entity-swap");
    expect(findings[0].severity).toBe("critical");
    // confidence should NOT be "low" when masking coverage is high
    expect(findings[0].confidence).not.toBe("low");
  });

  test("(b) near-identical pages with NO entity patterns → fires warning + confidence:low (not critical)", () => {
    // Without patterns, masking does nothing: the rule degenerates into
    // a plain near-duplicate detector with no entity-swap evidence.
    // Use truly identical pages so similarity always crosses the threshold.
    const { findings } = entitySwapRule([pageDup1, pageDup2], [], 0.9);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("spam/entity-swap");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("low");
    expect(findings[0].message).toMatch(/entity masking|weak.*mask|no.*pattern/i);
  });
});
