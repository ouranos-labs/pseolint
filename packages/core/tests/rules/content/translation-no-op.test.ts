import { describe, expect, test } from "vitest";
import { translationNoOpRule } from "../../../src/rules/content/translation-no-op.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, contentText: string): ParsedPage {
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
    contentText,
    html: "",
  };
}

// Substantial identical content to ensure SimHash similarity >= 0.95
const IDENTICAL_BODY =
  "Welcome to Best Firenze your premier destination for luxury experiences " +
  "in Florence Italy. We offer guided tours restaurant bookings and hotel " +
  "concierge services. Our team of experts has curated the best experiences " +
  "in the city for discerning travellers. Book now and enjoy Florence.";

// Distinct content blocks per locale -- well below 0.95 similarity
const EN_BODY =
  "Welcome to our Florence guide. Discover the best restaurants, museums and tours in Florence Italy.";
const FR_BODY =
  "Bienvenue sur notre guide de Florence. Decouvrez les meilleurs restaurants musees et visites a Florence.";
const IT_BODY =
  "Benvenuti nella nostra guida di Firenze. Scopri i migliori ristoranti musei e tour a Firenze.";
const DE_BODY =
  "Willkommen in unserem Florenz Reisefuehrer. Entdecken Sie die besten Restaurants Museen und Touren in Florenz.";
const ES_BODY =
  "Bienvenido a nuestra guia de Florencia. Descubre los mejores restaurantes museos y tours en Florencia.";

describe("translationNoOpRule", () => {
  test("positive: 5 locale variants of root with identical content fires 1 finding", () => {
    const pages = [
      page("https://bestfirenze.com/en", IDENTICAL_BODY),
      page("https://bestfirenze.com/fr", IDENTICAL_BODY),
      page("https://bestfirenze.com/it", IDENTICAL_BODY),
      page("https://bestfirenze.com/de", IDENTICAL_BODY),
      page("https://bestfirenze.com/es", IDENTICAL_BODY),
    ];
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("content/translation-no-op");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("5 locale variants");
    expect(findings[0].message).toContain("/");
  });

  test("positive: locale variants with subpath (e.g. /en/about, /fr/about) fires 1 finding", () => {
    const pages = [
      page("https://example.com/en/about", IDENTICAL_BODY),
      page("https://example.com/fr/about", IDENTICAL_BODY),
      page("https://example.com/de/about", IDENTICAL_BODY),
    ];
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("/about");
  });

  test("negative: 5 locale variants with actual translations -- no finding", () => {
    const pages = [
      page("https://example.com/en/home", EN_BODY),
      page("https://example.com/fr/home", FR_BODY),
      page("https://example.com/it/home", IT_BODY),
      page("https://example.com/de/home", DE_BODY),
      page("https://example.com/es/home", ES_BODY),
    ];
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(0);
  });

  test("negative: URLs differ but not by locale prefix -- no finding", () => {
    // These look like product pages, not locale paths
    const pages = [
      page("https://example.com/products/shoes", IDENTICAL_BODY),
      page("https://example.com/products/boots", IDENTICAL_BODY),
      page("https://example.com/products/sandals", IDENTICAL_BODY),
    ];
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(0);
  });

  test("negative: only 1 locale variant -- no finding", () => {
    const pages = [page("https://example.com/en/home", IDENTICAL_BODY)];
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(0);
  });

  test("short-path edge case: /en and /fr collapse to root template '/'", () => {
    const pages = [
      page("https://bestfirenze.com/en", IDENTICAL_BODY),
      page("https://bestfirenze.com/fr", IDENTICAL_BODY),
      page("https://bestfirenze.com/", IDENTICAL_BODY), // root has no locale -- NOT grouped
    ];
    // Only /en and /fr have locale prefixes and collapse to "/"
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("2 locale variants");
  });

  test("positive: country-region codes (en-US, fr-CA) are recognised as locale", () => {
    const pages = [
      page("https://example.com/en-US/pricing", IDENTICAL_BODY),
      page("https://example.com/fr-CA/pricing", IDENTICAL_BODY),
    ];
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("2 locale variants");
  });

  test("finding relatedUrls lists sibling URLs", () => {
    const pages = [
      page("https://bestfirenze.com/en", IDENTICAL_BODY),
      page("https://bestfirenze.com/fr", IDENTICAL_BODY),
      page("https://bestfirenze.com/it", IDENTICAL_BODY),
    ];
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(1);
    expect(findings[0].relatedUrls).toHaveLength(2);
  });

  test("v0.5.6 refinement: skip clusters where all variants are below MIN_WORDS_FOR_TRANSLATION_CHECK", () => {
    // 5 locale variants, all empty content. Pre-refinement this fired with
    // "100% similar"; but the real issue is they're empty (covered by
    // spam/thin-content). Co-firing was confusing on bestfirenze.com.
    const pages = [
      page("https://example.com/en", ""),
      page("https://example.com/fr", ""),
      page("https://example.com/it", ""),
      page("https://example.com/de", ""),
      page("https://example.com/es", ""),
    ];
    const findings = translationNoOpRule(pages);
    expect(findings).toHaveLength(0);
  });

});
