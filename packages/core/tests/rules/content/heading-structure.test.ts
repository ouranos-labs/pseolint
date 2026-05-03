import { describe, expect, test } from "vitest";
import { headingStructureRule } from "../../../src/rules/content/heading-structure.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, h1s: string[], h2s: string[] = [], wordCount = 100): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: h1s, h2: h2s },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText: "x ".repeat(wordCount),
    html: "",
  };
}

describe("headingStructureRule", () => {
  test("emits error when no <h1>", () => {
    const findings = headingStructureRule([page("https://ex.com/a", [])]);
    const noH1 = findings.find((f) => f.message.includes("no <h1>"));
    expect(noH1).toBeDefined();
    expect(noH1!.severity).toBe("error");
  });

  test("emits warning when multiple <h1>", () => {
    const findings = headingStructureRule([page("https://ex.com/a", ["First", "Second"])]);
    const multi = findings.find((f) => f.message.includes("2 <h1>"));
    expect(multi).toBeDefined();
    expect(multi!.severity).toBe("warning");
  });

  test("emits info on long page with no <h2>", () => {
    const findings = headingStructureRule([
      page("https://ex.com/a", ["Topic"], [], 800),
    ]);
    const long = findings.find((f) => f.message.includes("no <h2>"));
    expect(long).toBeDefined();
    expect(long!.severity).toBe("info");
  });

  test("emits nothing on a healthy page", () => {
    const findings = headingStructureRule([
      page("https://ex.com/a", ["Topic"], ["Section A", "Section B"], 800),
    ]);
    expect(findings).toEqual([]);
  });
});
