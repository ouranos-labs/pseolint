import { describe, expect, test } from "vitest";
import { missingAuthorRule } from "../../../src/rules/content/missing-author.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: "", ...overrides
  };
}

describe("missingAuthorRule", () => {
  test("flags page with no author signals", () => {
    const findings = missingAuthorRule([page("https://example.com/no-author")]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("content/missing-author");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].pageUrl).toBe("https://example.com/no-author");
    // Always medium: many page types legitimately omit author bylines.
    expect(findings[0].confidence).toBe("medium");
    expect(findings[0].message).toMatch(/blog\/news/i);
  });

  test("emits site-wide finding with medium confidence when ALL pages lack author", () => {
    const findings = missingAuthorRule([
      page("https://example.com/a"),
      page("https://example.com/b"),
      page("https://example.com/c"),
      page("https://example.com/d"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("medium");
    expect(findings[0].message).toMatch(/blog\/news/i);
  });

  test("passes when metaAuthor is present", () => {
    const findings = missingAuthorRule([
      page("https://example.com/a", { authorSignals: { metaAuthor: "John", schemaAuthor: false, bylineElement: false, relAuthorLink: false } })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("passes when schemaAuthor is true", () => {
    const findings = missingAuthorRule([
      page("https://example.com/b", { authorSignals: { metaAuthor: "", schemaAuthor: true, bylineElement: false, relAuthorLink: false } })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("passes when bylineElement is true", () => {
    const findings = missingAuthorRule([
      page("https://example.com/c", { authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: true, relAuthorLink: false } })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("passes when relAuthorLink is true", () => {
    const findings = missingAuthorRule([
      page("https://example.com/d", { authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: true } })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("flags multiple pages missing author", () => {
    const findings = missingAuthorRule([
      page("https://example.com/x"),
      page("https://example.com/y"),
      page("https://example.com/z", { authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false } })
    ]);
    expect(findings).toHaveLength(2);
  });
});
