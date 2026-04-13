import { describe, expect, test } from "vitest";
import { schemaConsistencyRule } from "../../../src/rules/schema/consistency.js";
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

describe("schema/consistency", () => {
  test("flags mixed schema types across pages", () => {
    const a = page("https://example.dev/a", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article" }]
    });
    const b = page("https://example.dev/b", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Product" }]
    });
    const findings = schemaConsistencyRule([a, b]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("schema/consistency");
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("Article");
    expect(findings[0].message).toContain("Product");
    expect(findings[0].relatedUrls).toContain(a.url);
    expect(findings[0].relatedUrls).toContain(b.url);
  });

  test("no finding when all pages use the same type", () => {
    const a = page("https://example.dev/a", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article" }]
    });
    const b = page("https://example.dev/b", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article" }]
    });
    const findings = schemaConsistencyRule([a, b]);
    expect(findings).toHaveLength(0);
  });

  test("no finding with a single page", () => {
    const a = page("https://example.dev/a", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article" }]
    });
    const findings = schemaConsistencyRule([a]);
    expect(findings).toHaveLength(0);
  });

  test("ignores pages without JSON-LD", () => {
    const a = page("https://example.dev/a", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article" }]
    });
    const b = page("https://example.dev/b");
    const findings = schemaConsistencyRule([a, b]);
    expect(findings).toHaveLength(0);
  });

  test("skips entries with parse errors", () => {
    const a = page("https://example.dev/a", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article" }]
    });
    const b = page("https://example.dev/b", {
      jsonLd: [{ __parseError: true, __raw: "{bad}" }]
    });
    const findings = schemaConsistencyRule([a, b]);
    expect(findings).toHaveLength(0);
  });
});
