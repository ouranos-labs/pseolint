import { describe, expect, test } from "vitest";
import { htmlSizeRule } from "../../../src/rules/tech/html-size.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, html: string): ParsedPage {
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
    structureSignature: "",
    contentText: "",
    html,
  };
}

const MB = 1024 * 1024;

describe("htmlSizeRule", () => {
  test("no finding below the 1.5 MB warning threshold", () => {
    const findings = htmlSizeRule([page("https://ex.com/a", "x".repeat(1.5 * MB - 1))]);
    expect(findings).toEqual([]);
  });

  test("warning at exactly 1.5 MB", () => {
    const findings = htmlSizeRule([page("https://ex.com/a", "x".repeat(1.5 * MB))]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("tech/html-size");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("high");
    expect(findings[0].message).toContain("1.5 MB");
  });

  test("error at exactly the 2 MB Googlebot cutoff boundary", () => {
    const findings = htmlSizeRule([page("https://ex.com/a", "x".repeat(2 * MB))]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("2.0 MB");
  });

  test("warning just below 2 MB", () => {
    const findings = htmlSizeRule([page("https://ex.com/a", "x".repeat(2 * MB - 1))]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test("measures utf8 bytes, not string length (multibyte chars count fully)", () => {
    // "é" is 2 bytes in utf8, so 1M chars = 2 MB of bytes, at the error boundary.
    const findings = htmlSizeRule([page("https://ex.com/a", "é".repeat(MB))]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  test("skips pages with empty html", () => {
    const findings = htmlSizeRule([page("https://ex.com/a", "")]);
    expect(findings).toEqual([]);
  });
});
