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
  test("valid codes pass: en, en-GB, pt-BR, zh-Hans, x-default, fil", () => {
    const findings = hreflangValidityRule([
      page("https://ex.com/", ["en", "en-GB", "pt-BR", "zh-Hans", "x-default", "fil"]),
    ]);
    expect(findings).toEqual([]);
  });

  // Google, verbatim: "Only language codes listed in ISO 639-1 and region codes
  // listed in ISO 3166-1 Alpha 2 are supported; other codes that aren't listed
  // in those standards, such as es-419, aren't supported."
  // https://developers.google.com/search/docs/specialty/international/localized-versions
  test("es-419 fires: UN M.49 numeric regions are the doc's own counter-example", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["es-419"])]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("419");
    expect(findings[0].message).toContain("ISO 3166-1 Alpha 2");
    // The fix must give an alternative that actually works.
    expect(findings[0].fix).toContain('hreflang="es"');
  });

  // Intl.DisplayNames resolves every one of these through CLDR's alias table
  // (SU→Russia, CS/YU→Serbia, AN→Curaçao) or as a reserved non-country code
  // (ZZ "Unknown Region", EU), so all six used to pass silently.
  test.each(["en-SU", "en-CS", "en-AN", "en-YU", "en-ZZ", "en-EU"])(
    "withdrawn / reserved region %s fires",
    (lang) => {
      const findings = hreflangValidityRule([page("https://ex.com/", [lang])]);
      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain(lang.split("-")[1]);
    },
  );

  test("a withdrawn region's fix names the modern replacement", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["en-SU"])]);
    expect(findings[0].message).toContain("withdrawn");
    expect(findings[0].fix).toContain("en-RU");
  });

  // The old check was gated on `language.length === 2`, so no three-letter
  // language subtag was ever validated at all.
  test("eng-US fires: three-letter codes are ISO 639-2/3, not the ISO 639-1 Google supports", () => {
    const findings = hreflangValidityRule([page("https://ex.com/", ["eng-US"])]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("ISO 639-1");
    expect(findings[0].fix).toContain("en-US");
  });

  test("a three-letter code with NO ISO 639-1 equivalent is left alone", () => {
    // fil / haw / ceb have no two-letter code, so there is no correct
    // alternative to recommend and flagging them would be unactionable.
    const findings = hreflangValidityRule([page("https://ex.com/", ["fil-PH", "haw", "ceb"])]);
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
