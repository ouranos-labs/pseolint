import { describe, expect, test } from "vitest";
import { eeatSignalsRule } from "../../../src/rules/content/eeat-signals.js";
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

describe("eeatSignalsRule", () => {
  test("flags page with zero signals", () => {
    const findings = eeatSignalsRule([page("https://example.com/bare")]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("content/eeat-signals");
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("E-E-A-T");
  });

  test("flags page with only 1 signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/one", { publishedDate: "2024-01-01" })
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("E-E-A-T");
  });

  test("passes page with 2 signals (author + about link)", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/good", {
        authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
        resolvedHrefs: ["https://example.com/about"]
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts about page link signal from resolvedHrefs", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/p", {
        resolvedHrefs: ["https://example.com/about-us"],
        publishedDate: "2024-06-01"
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts last-updated HTML pattern as a signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/q", {
        html: "<p>Last Updated: March 2024</p>",
        publishedDate: "2024-03-01"
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts reviewed-by HTML pattern as a signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/r", {
        html: "<span>Reviewed by Dr. Smith</span>",
        authorSignals: { metaAuthor: "Author", schemaAuthor: false, bylineElement: false, relAuthorLink: false }
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts sources: HTML pattern as a signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/s", {
        html: "<h2>Sources:</h2><ul><li>CDC</li></ul>",
        publishedDate: "2024-01-01"
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts references: HTML pattern as a signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/t", {
        html: "<h3>References:</h3>",
        resolvedHrefs: ["https://example.com/about"]
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("does not count about link when href has no /about path", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/u", {
        resolvedHrefs: ["https://example.com/contact"]
      })
    ]);
    expect(findings).toHaveLength(1);
  });

  test("passes page with all 4 signal categories", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/full", {
        authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
        resolvedHrefs: ["https://example.com/about"],
        publishedDate: "2024-01-01",
        html: "<p>Last modified: Jan 2024</p> <h2>Sources:</h2>"
      })
    ]);
    expect(findings).toHaveLength(0);
  });
});
