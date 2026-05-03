import { describe, expect, test } from "vitest";
import { imageAltTextRule } from "../../../src/rules/content/image-alt-text.js";
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

describe("imageAltTextRule", () => {
  test("does not fire when all images have alt", () => {
    const findings = imageAltTextRule([
      page("https://ex.com/a", '<img src="x.jpg" alt="X"><img src="y.jpg" alt="Y">'),
    ]);
    expect(findings).toEqual([]);
  });

  test("fires warning when half or more images miss alt", () => {
    const findings = imageAltTextRule([
      page("https://ex.com/a", '<img src="x.jpg"><img src="y.jpg">'),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("2 of 2");
  });

  test("fires info when fewer than half are missing", () => {
    const findings = imageAltTextRule([
      page("https://ex.com/a", '<img src="x.jpg" alt="X"><img src="y.jpg" alt="Y"><img src="z.jpg">'),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
  });

  test('skips decorative images (role="presentation" or aria-hidden="true")', () => {
    const findings = imageAltTextRule([
      page("https://ex.com/a", '<img src="x.jpg" role="presentation"><img src="y.jpg" aria-hidden="true">'),
    ]);
    expect(findings).toEqual([]);
  });

  test('accepts empty alt="" as a deliberate decorative marker', () => {
    const findings = imageAltTextRule([
      page("https://ex.com/a", '<img src="x.jpg" alt="">'),
    ]);
    expect(findings).toEqual([]);
  });
});
