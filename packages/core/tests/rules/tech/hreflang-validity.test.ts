import { describe, expect, test } from "vitest";
import { hreflangValidityRule } from "../../../src/rules/tech/hreflang-validity.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, langs: string[]): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: langs.map((lang) => ({ lang, href: `${url}?v=${encodeURIComponent(lang)}` })),
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText: "",
    html: "",
  };
}

describe("hreflangValidityRule", () => {
  test("valid codes pass: en, en-GB, pt-BR, zh-Hans, x-default, es-419, fil", () => {
    const findings = hreflangValidityRule([
      page("https://ex.com/", ["en", "en-GB", "pt-BR", "zh-Hans", "x-default", "es-419", "fil"]),
    ]);
    expect(findings).toEqual([]);
  });

  test("underscore separator fires and the fix suggests the hyphen form", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["en_US"])]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].fix).toContain("en-US");
  });

  test("en-UK fires and the fix suggests en-GB", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["en-UK"])]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("GB");
    expect(findings[0].fix).toContain("en-GB");
  });

  test("jp fires and the fix suggests ja", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["jp"])]);
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toContain('"ja"');
  });

  test("cn-style country-as-language fires with the zh suggestion, region intact", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["cn-TW"])]);
    expect(findings).toHaveLength(1);
    expect(findings[0].fix).toContain("zh-TW");
  });

  test("grammar garbage like 'english' fires", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["english"])]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("not a valid");
  });

  test("unknown region code fires", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["en-AA"])]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('"AA"');
  });

  test("repeated identical values on one page fire once", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["en_US", "en_US", "en_US"])]);
    expect(findings).toHaveLength(1);
  });

  test("each invalid value fires independently", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["jp", "en-UK", "de"])]);
    expect(findings).toHaveLength(2);
  });

  test("Google ignoring the annotation is stated in every message", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["en_US"])]);
    expect(findings[0].message).toContain("ignores");
  });
});
