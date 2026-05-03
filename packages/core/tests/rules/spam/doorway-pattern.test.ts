import { describe, expect, test } from "vitest";
import { doorwayPatternRule } from "../../../src/rules/spam/doorway-pattern.js";
import type { ParsedPage } from "../../../src/types.js";
import type { PairMatch } from "../../../src/rules/spam/near-duplicate.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
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
    structureSignature: "default",
    contentText: "x ".repeat(200),
    html: "<html></html>",
    ...overrides,
  };
}

const pair = (left: string, right: string): PairMatch => ({ leftUrl: left, rightUrl: right, similarity: 0.95 });

describe("spam/doorway-pattern", () => {
  test("does NOT fire on a catalog: near-dup + entity-swap + identical-structure but unique meta + non-thin", () => {
    // The 2026-05-03 calibration finding: catalog directories (Zapier
    // integrations, Segment source/destination pages) are by-design
    // near-duplicate + entity-swap + identical-structure. The pre-fix rule
    // fired CRITICAL on every such pair (300× on a 25-page Segment audit).
    // After the fix, a content-quality signal (thin OR identical-meta) is
    // required as the third signal — purely-structural similarity isn't
    // enough.
    const a = page("https://ex.com/integrations/slack-google-sheets", {
      metaDescription: "Connect Slack to Google Sheets — sync messages, alerts, and channel events.",
      structureSignature: "catalog-shell",
    });
    const b = page("https://ex.com/integrations/slack-airtable", {
      metaDescription: "Connect Slack to Airtable — sync messages, records, and table events.",
      structureSignature: "catalog-shell",
    });
    const ndPairs = [pair(a.url, b.url)];
    const esPairs = [pair(a.url, b.url)];
    const thin = new Set<string>();
    const findings = doorwayPatternRule(ndPairs, esPairs, thin, [a, b]);
    expect(findings).toEqual([]);
  });

  test("fires on a real doorway: near-dup + entity-swap + thin", () => {
    const a = page("https://ex.com/seo-services-akron", {
      metaDescription: "Looking for SEO in Akron? Call us today.",
      structureSignature: "doorway-shell",
    });
    const b = page("https://ex.com/seo-services-toledo", {
      metaDescription: "Looking for SEO in Toledo? Call us today.",
      structureSignature: "doorway-shell",
    });
    const ndPairs = [pair(a.url, b.url)];
    const esPairs = [pair(a.url, b.url)];
    const thin = new Set([a.url, b.url]);
    const findings = doorwayPatternRule(ndPairs, esPairs, thin, [a, b]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
    expect(findings[0].message).toContain("thin-content");
  });

  test("fires on a real doorway: near-dup + entity-swap + identical-meta", () => {
    const a = page("https://ex.com/buy-shoes-akron", {
      metaDescription: "Best shoes near you. Free shipping. Buy today.",
      structureSignature: "shell-a",
    });
    const b = page("https://ex.com/buy-shoes-toledo", {
      metaDescription: "Best shoes near you. Free shipping. Buy today.",
      structureSignature: "shell-b",
    });
    const ndPairs = [pair(a.url, b.url)];
    const esPairs = [pair(a.url, b.url)];
    const findings = doorwayPatternRule(ndPairs, esPairs, new Set(), [a, b]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("identical-meta");
  });

  test("does NOT fire when only near-dup + entity-swap (2 signals)", () => {
    const a = page("https://ex.com/p/1", { structureSignature: "a" });
    const b = page("https://ex.com/p/2", { structureSignature: "b" });
    const findings = doorwayPatternRule([pair(a.url, b.url)], [pair(a.url, b.url)], new Set(), [a, b]);
    expect(findings).toEqual([]);
  });

  test("does NOT fire when pair is near-dup but NOT entity-swap", () => {
    const a = page("https://ex.com/p/1");
    const b = page("https://ex.com/p/2");
    const findings = doorwayPatternRule([pair(a.url, b.url)], [], new Set([a.url]), [a, b]);
    expect(findings).toEqual([]);
  });
});
