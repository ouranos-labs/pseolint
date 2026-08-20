import { describe, expect, test } from "vitest";
import { ogCompletenessRule } from "../../../src/rules/tech/og-completeness.js";
import type { ParsedPage } from "../../../src/types.js";

function page(
  url: string,
  og: { title?: string; description?: string; image?: string },
  html = ""
): ParsedPage {
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
    html,
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

  test("fires when og:image is missing, severity info (cosmetic only)", () => {
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

  // --- og:type / og:url (ogp.me required properties, detected from html) ---

  const fullOgHtml = [
    "<head>",
    '<meta property="og:title" content="Title">',
    '<meta property="og:description" content="Desc">',
    '<meta property="og:image" content="https://img">',
    '<meta property="og:type" content="article">',
    '<meta property="og:url" content="https://ex.com/a">',
    "</head>",
  ].join("");

  test("full OG set including og:type and og:url → no finding", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "Title", description: "Desc", image: "https://img" }, fullOgHtml),
    ]);
    expect(findings).toEqual([]);
  });

  test("title/description/image present but no og:type → info naming og:type", () => {
    const html = [
      "<head>",
      '<meta property="og:title" content="Title">',
      '<meta property="og:description" content="Desc">',
      '<meta property="og:image" content="https://img">',
      '<meta property="og:url" content="https://ex.com/a">',
      "</head>",
    ].join("");
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "Title", description: "Desc", image: "https://img" }, html),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("og:type");
    expect(findings[0].message).not.toContain("og:url");
  });

  test("core present but both og:type and og:url missing → single info listing both", () => {
    const html = '<head><meta property="og:title" content="Title"></head>';
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "Title", description: "Desc", image: "https://img" }, html),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("og:type");
    expect(findings[0].message).toContain("og:url");
  });

  test("detects og:type/og:url despite attribute order and quote variations", () => {
    const html = [
      "<head>",
      "<meta content='article' property='og:type'>",
      '<meta content="https://ex.com/a" property=og:url >',
      "</head>",
    ].join("");
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "Title", description: "Desc", image: "https://img" }, html),
    ]);
    expect(findings).toEqual([]);
  });

  test("missing core tags: detectable missing aux tags are appended without changing severity", () => {
    const html = '<head><meta property="og:url" content="https://ex.com/a"></head>';
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { description: "Desc", image: "https://img" }, html),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("og:title");
    expect(findings[0].message).toContain("og:type");
    expect(findings[0].message).not.toContain("og:url");
  });

  test("empty html → aux tags not checked (existing behavior preserved)", () => {
    const findings = ogCompletenessRule([
      page("https://ex.com/a", { title: "Title", description: "Desc", image: "https://img" }, ""),
    ]);
    expect(findings).toEqual([]);
  });
});
