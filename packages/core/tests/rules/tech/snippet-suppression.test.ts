import { describe, expect, test } from "vitest";
import { snippetSuppressionRule } from "../../../src/rules/tech/snippet-suppression.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, html: string, xRobotsTag = ""): ParsedPage {
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
    httpMeta: xRobotsTag
      ? { statusCode: 200, finalUrl: url, redirectChain: [], xRobotsTag, linkHeader: "" }
      : undefined,
  };
}

describe("snippetSuppressionRule", () => {
  test("warning when meta robots contains nosnippet", () => {
    const findings = snippetSuppressionRule([
      page("https://ex.com/a", '<head><meta name="robots" content="nosnippet"></head>'),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("tech/snippet-suppression");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("high");
    expect(findings[0].message).toContain("meta robots");
    expect(findings[0].message).toContain("AI Overviews");
  });

  test("warning for max-snippet:0", () => {
    const findings = snippetSuppressionRule([
      page("https://ex.com/a", '<head><meta name="robots" content="index, max-snippet:0"></head>'),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test('warning for "max-snippet: 0" with a space', () => {
    const findings = snippetSuppressionRule([
      page("https://ex.com/a", '<head><meta name="googlebot" content="max-snippet: 0"></head>'),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("meta googlebot");
  });

  test("max-snippet:-1 (unlimited) → no finding", () => {
    const findings = snippetSuppressionRule([
      page("https://ex.com/a", '<head><meta name="robots" content="index, max-snippet:-1"></head>'),
    ]);
    expect(findings).toEqual([]);
  });

  test("positive max-snippet limit → no finding", () => {
    const findings = snippetSuppressionRule([
      page("https://ex.com/a", '<head><meta name="robots" content="max-snippet:160"></head>'),
    ]);
    expect(findings).toEqual([]);
  });

  test("warning when nosnippet arrives via X-Robots-Tag header only", () => {
    const findings = snippetSuppressionRule([
      page("https://ex.com/a", "<html><body>hi</body></html>", "nosnippet"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("X-Robots-Tag header");
  });

  test("info with count for data-nosnippet attributes in the body", () => {
    const findings = snippetSuppressionRule([
      page(
        "https://ex.com/a",
        '<html><body><div data-nosnippet>legal</div><span data-nosnippet="">footer</span></body></html>'
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("2 data-nosnippet");
    expect(findings[0].message).toContain("intentional");
  });

  test("nosnippet meta and data-nosnippet together → warning plus info", () => {
    const findings = snippetSuppressionRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="nosnippet"></head><body><p data-nosnippet>x</p></body>'
      ),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.severity).sort()).toEqual(["info", "warning"]);
  });

  test("clean page → no finding", () => {
    const findings = snippetSuppressionRule([
      page("https://ex.com/a", '<head><meta name="robots" content="index, follow"></head>'),
    ]);
    expect(findings).toEqual([]);
  });

  test("empty html and no header → no finding", () => {
    const findings = snippetSuppressionRule([page("https://ex.com/a", "")]);
    expect(findings).toEqual([]);
  });
});
