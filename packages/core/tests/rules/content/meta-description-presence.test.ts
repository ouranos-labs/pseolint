import { describe, expect, test } from "vitest";
import { metaDescriptionPresenceRule } from "../../../src/rules/content/meta-description-presence.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, metaDescription: string, html: string): ParsedPage {
  return {
    url,
    title: "",
    metaDescription,
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

describe("metaDescriptionPresenceRule", () => {
  test("fires warning when meta description is empty and html is non-empty", () => {
    const findings = metaDescriptionPresenceRule([
      page("https://ex.com/a", "", "<html><head></head><body>hi</body></html>"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("content/meta-description-presence");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("high");
    expect(findings[0].pageUrl).toBe("https://ex.com/a");
    expect(findings[0].fix).toContain("description");
  });

  test("treats whitespace-only description as missing", () => {
    const findings = metaDescriptionPresenceRule([
      page("https://ex.com/a", "   \t", "<html><body>hi</body></html>"),
    ]);
    expect(findings).toHaveLength(1);
  });

  test("does not fire when a meta description is present", () => {
    const findings = metaDescriptionPresenceRule([
      page("https://ex.com/a", "A summary of this page.", "<html><body>hi</body></html>"),
    ]);
    expect(findings).toEqual([]);
  });

  test("skips pages with empty html (nothing was fetched/parsed)", () => {
    const findings = metaDescriptionPresenceRule([page("https://ex.com/a", "", "")]);
    expect(findings).toEqual([]);
  });

  test("one finding per missing page across a mixed set", () => {
    const findings = metaDescriptionPresenceRule([
      page("https://ex.com/a", "", "<html></html>"),
      page("https://ex.com/b", "Has one.", "<html></html>"),
      page("https://ex.com/c", "", "<html></html>"),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.pageUrl)).toEqual(["https://ex.com/a", "https://ex.com/c"]);
  });
});
