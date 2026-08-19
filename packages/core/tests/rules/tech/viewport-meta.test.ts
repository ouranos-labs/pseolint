import { describe, expect, test } from "vitest";
import { viewportMetaRule } from "../../../src/rules/tech/viewport-meta.js";
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

describe("viewportMetaRule", () => {
  test("no finding when a standard viewport meta is present", () => {
    const findings = viewportMetaRule([
      page(
        "https://ex.com/a",
        '<head><meta name="viewport" content="width=device-width, initial-scale=1"></head>'
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("warning when html is non-empty and no viewport meta exists", () => {
    const findings = viewportMetaRule([
      page("https://ex.com/a", "<html><head><title>t</title></head><body>hi</body></html>"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("tech/viewport-meta");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("high");
    expect(findings[0].fix).toContain("width=device-width");
  });

  test("viewport tag whose content lacks width= still fires", () => {
    const findings = viewportMetaRule([
      page("https://ex.com/a", '<head><meta name="viewport" content="initial-scale=1"></head>'),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test("handles attribute order and quote variations", () => {
    const findings = viewportMetaRule([
      page("https://ex.com/a", "<head><meta content='width=device-width' name='VIEWPORT'></head>"),
    ]);
    expect(findings).toEqual([]);
  });

  test("skips pages with empty html", () => {
    const findings = viewportMetaRule([page("https://ex.com/a", "")]);
    expect(findings).toEqual([]);
  });

  test("one finding per page across a mixed set", () => {
    const findings = viewportMetaRule([
      page("https://ex.com/a", "<html><body>no viewport</body></html>"),
      page("https://ex.com/b", '<head><meta name="viewport" content="width=device-width"></head>'),
      page("https://ex.com/c", "<html><body>also none</body></html>"),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.pageUrl)).toEqual(["https://ex.com/a", "https://ex.com/c"]);
  });
});
