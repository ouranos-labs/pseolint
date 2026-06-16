import { describe, expect, test } from "vitest";
import { requiredFieldsRule } from "../../../src/rules/schema/required-fields.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
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
    contentText: "",
    html: "",
    ...overrides
  };
}

describe("schema/required-fields", () => {
  test("flags Article missing headline, author, datePublished", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article" }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("headline");
    expect(findings[0].message).toContain("author");
    expect(findings[0].message).toContain("datePublished");
  });

  test("passes complete Article", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Test",
        author: "Author",
        datePublished: "2025-01-01"
      }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(0);
  });

  test("flags Product missing name and price", () => {
    const p = page("https://example.dev/p", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Product" }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("name");
    expect(findings[0].message).toContain("price");
  });

  test("accepts Product with offers.price", () => {
    const p = page("https://example.dev/p", {
      jsonLd: [{
        "@context": "https://schema.org",
        "@type": "Product",
        name: "Widget",
        offers: { price: "9.99" }
      }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(0);
  });

  test("flags FAQPage missing mainEntity", () => {
    const p = page("https://example.dev/faq", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "FAQPage" }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("mainEntity");
  });

  test("skips entries with parse errors", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ __parseError: true, __raw: "{bad}" }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(0);
  });

  // --- presence-not-quality fixes ---

  test("flags FAQPage with mainEntity as empty array", () => {
    const p = page("https://example.dev/faq", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [] }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("mainEntity");
  });

  test("flags Article with whitespace-only headline", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "  ",
        author: "Author",
        datePublished: "2025-01-01"
      }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("headline");
  });

  test("does NOT flag Article with valid object author (Person)", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Test",
        author: { "@type": "Person", name: "Alice" },
        datePublished: "2025-01-01"
      }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(0);
  });

  test("flags Article with author as false (boolean)", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Test",
        author: false,
        datePublished: "2025-01-01"
      }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("author");
  });

  test("flags Article with author as 0 (number)", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{
        "@context": "https://schema.org",
        "@type": "Article",
        headline: "Test",
        author: 0,
        datePublished: "2025-01-01"
      }]
    });
    const findings = requiredFieldsRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("author");
  });
});
