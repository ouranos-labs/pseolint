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
  // --- original passing tests (updated for new severity rules) ---

  test("does not fire when all three OG tags are present", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "T", description: "D", image: "I" }),
    ]);
    expect(findings).toEqual([]);
  });

  test("fires when og:image is missing — severity info (cosmetic only)", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "T", description: "D" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("og:image");
  });

  test("fires once per page even with all three missing", () => {
    const findings = ogCompletenessRule([page("https://ex.com/a", {})]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("og:title");
    expect(findings[0].message).toContain("og:description");
    expect(findings[0].message).toContain("og:image");
  });

  // --- new tests for whitespace handling ---

  test("treats whitespace-only og:title as missing and flags", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: " ", description: "D", image: "I" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("og:title");
  });

  test("treats whitespace-only og:description as missing and flags", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "T", description: "   ", image: "I" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("og:description");
  });

  test("treats whitespace-only og:image as missing and flags as info", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "T", description: "D", image: "\t" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("og:image");
  });

  // --- severity gradation ---

  test("missing og:title → warning (core social-card field)", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { description: "D", image: "I" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test("missing og:description → warning (core social-card field)", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "T", image: "I" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test("missing og:title and og:description → warning", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { image: "I" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test("all three present and non-empty (no whitespace edge case) → no finding", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "Title", description: "Desc", image: "https://img" }),
    ]);
    expect(findings).toEqual([]);
  });
});
