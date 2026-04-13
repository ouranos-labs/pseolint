import { describe, expect, test } from "vitest";
import { jsonLdValidRule } from "../../../src/rules/schema/json-ld-valid.js";
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

describe("schema/json-ld-valid", () => {
  test("flags malformed JSON-LD with __parseError", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ __parseError: true, __raw: "{bad json" }]
    });
    const findings = jsonLdValidRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("schema/json-ld-valid");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("malformed JSON-LD");
  });

  test("flags missing @context", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ "@type": "Article" }]
    });
    const findings = jsonLdValidRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("@context");
  });

  test("flags invalid @type value", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "" }]
    });
    const findings = jsonLdValidRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("invalid @type");
  });

  test("passes valid JSON-LD", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ "@context": "https://schema.org", "@type": "Article" }]
    });
    const findings = jsonLdValidRule([p]);
    expect(findings).toHaveLength(0);
  });

  test("no findings for empty jsonLd", () => {
    const p = page("https://example.dev/a");
    const findings = jsonLdValidRule([p]);
    expect(findings).toHaveLength(0);
  });
});
