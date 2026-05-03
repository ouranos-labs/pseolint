import { describe, expect, test } from "vitest";
import { ogCompletenessRule } from "../../../src/rules/tech/og-completeness.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, og: { title?: string; description?: string; image?: string }): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: {
      title: og.title ?? "",
      description: og.description ?? "",
      image: og.image ?? "",
    },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText: "",
    html: "",
  };
}

describe("ogCompletenessRule", () => {
  test("does not fire when all three OG tags are present", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "T", description: "D", image: "I" }),
    ]);
    expect(findings).toEqual([]);
  });

  test("fires when og:image is missing", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "T", description: "D" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("og:image");
  });

  test("fires once per page even with all three missing", () => {
    const findings = ogCompletenessRule([page("https://ex.com/a", {})]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("og:title");
    expect(findings[0].message).toContain("og:description");
    expect(findings[0].message).toContain("og:image");
  });
});
