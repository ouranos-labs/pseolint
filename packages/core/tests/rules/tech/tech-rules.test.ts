import { describe, expect, test } from "vitest";
import { canonicalConsistencyRule } from "../../../src/rules/tech/canonical-consistency.js";
import { canonicalNoindexConflictRule } from "../../../src/rules/tech/canonical-noindex-conflict.js";
import { hreflangConsistencyRule } from "../../../src/rules/tech/hreflang-consistency.js";
import { ogCompletenessRule } from "../../../src/rules/tech/og-completeness.js";
import { robotsNoindexConflictRule } from "../../../src/rules/tech/robots-noindex-conflict.js";
import type { NormalizeUrlOptions, ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: url,
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText: "",
    html: "",
    ...overrides
  };
}

const normalizeOpts: NormalizeUrlOptions = { stripQuery: true, stripWwwHost: false };

describe("technical seo rules", () => {
  test("canonical consistency flags missing and cross-page canonical", () => {
    const a = page("https://example.dev/a", { canonical: "" });
    const b = page("https://example.dev/b", { canonical: "https://example.dev/a" });
    const findings = canonicalConsistencyRule([a, b], new Set([a.url, b.url]), normalizeOpts);
    expect(findings.some((f) => f.message.includes("missing a canonical"))).toBe(true);
    expect(findings.some((f) => f.message.includes("canonicalizes to another crawled page"))).toBe(true);
  });

  test("robots noindex conflict severity depends on inbound links", () => {
    const a = page("https://example.dev/a", { robotsMeta: "noindex,follow" });
    const b = page("https://example.dev/b", { robotsMeta: "noindex" });
    const inbound = new Map<string, number>([
      [a.url, 2],
      [b.url, 0]
    ]);
    const findings = robotsNoindexConflictRule([a, b], inbound);
    expect(findings.find((f) => f.pageUrl === a.url)?.severity).toBe("warning");
    expect(findings.find((f) => f.pageUrl === b.url)?.severity).toBe("info");
  });

  test("canonical noindex conflict flags conflicting directives", () => {
    const a = page("https://example.dev/a", {
      robotsMeta: "noindex,follow",
      canonical: "https://example.dev/b"
    });
    const findings = canonicalNoindexConflictRule([a], normalizeOpts);
    expect(findings.some((f) => f.ruleId === "tech/canonical-noindex-conflict")).toBe(true);
  });

  test("og completeness reports missing fields", () => {
    const a = page("https://example.dev/a", { og: { title: "x", description: "", image: "" } });
    const findings = ogCompletenessRule([a]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("og:description");
    expect(findings[0].message).toContain("og:image");
  });

  test("hreflang consistency warns on duplicate and missing x-default", () => {
    const a = page("https://example.dev/a", {
      hreflangs: [
        { lang: "en", href: "https://example.dev/en/a" },
        { lang: "en", href: "https://example.dev/en/a-dup" }
      ]
    });
    const findings = hreflangConsistencyRule([a], normalizeOpts);
    expect(findings.some((f) => f.message.includes("duplicate hreflang"))).toBe(true);
    expect(findings.some((f) => f.message.includes("no x-default"))).toBe(true);
  });
});
