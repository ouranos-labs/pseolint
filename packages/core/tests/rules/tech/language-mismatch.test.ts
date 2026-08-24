import { describe, expect, test } from "vitest";
import { languageMismatchRule } from "../../../src/rules/tech/language-mismatch.js";
import type { ParsedPage } from "../../../src/types.js";

const CYRILLIC = "Токио является столицей Японии и крупнейшим городом страны. Здесь расположены императорский дворец, множество музеев и парков. ".repeat(4);
const JAPANESE = "東京は日本の首都であり、最大の都市です。皇居、博物館、公園などがあります。ひらがなとカタカナのテキストサンプル。".repeat(6);
const ENGLISH = "Tokyo is the capital of Japan and its largest city, home to the imperial palace and many museums and parks worth visiting. ".repeat(4);

function page(
  url: string,
  opts: { html?: string; contentText?: string; hreflangs?: Array<{ lang: string; href: string }> } = {}
): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: opts.hreflangs ?? [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText: opts.contentText ?? "",
    html: opts.html ?? "",
  };
}

describe("languageMismatchRule", () => {
  test("the viral case: lang=ja with a Cyrillic body fires an error naming Cyrillic", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/tokyo", { html: `<html lang="ja"><body></body></html>`, contentText: CYRILLIC }),
    ]);
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe("tech/language-mismatch");
    expect(errors[0].message).toContain("Cyrillic");
    expect(errors[0].message).toContain('"ja"');
    expect(errors[0].confidence).toBe("high");
  });

  test("a correct Japanese page under lang=ja stays silent", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/tokyo", { html: `<html lang="ja">`, contentText: JAPANESE }),
    ]);
    expect(findings).toEqual([]);
  });

  test("missing html lang with hreflang annotations fires info that disclaims ranking impact", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/", {
        html: `<html><body></body></html>`,
        contentText: ENGLISH,
        hreflangs: [{ lang: "fr", href: "https://ex.com/fr" }],
      }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("does not use the lang attribute for ranking");
  });

  test("missing html lang with a Latin body and no hreflangs stays silent", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/", { html: `<html><body></body></html>`, contentText: ENGLISH }),
    ]);
    expect(findings).toEqual([]);
  });

  test("Latin minority under lang=ru is tolerated (brand names, code)", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/ru", {
        html: `<html lang="ru">`,
        contentText: `${CYRILLIC} GitHub TypeScript JavaScript API Node cloud hosting review benchmark comparison pricing plans documentation`,
      }),
    ]);
    expect(findings).toEqual([]);
  });

  test("a ≥30% Cyrillic block under lang=en fires the mixed-language warning", () => {
    const half = CYRILLIC.slice(0, Math.floor(CYRILLIC.length * 0.9));
    const findings = languageMismatchRule([
      page("https://ex.com/mixed", { html: `<html lang="en">`, contentText: `${ENGLISH} ${half}` }),
    ]);
    const warnings = findings.filter((f) => f.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("Cyrillic");
    expect(warnings[0].confidence).toBe("medium");
  });

  test("short text is skipped entirely", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/stub", { html: `<html lang="ja">`, contentText: "Привет мир" }),
    ]);
    expect(findings).toEqual([]);
  });

  test("an unknown declared language is never judged", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/x", { html: `<html lang="tlh">`, contentText: CYRILLIC }),
    ]);
    expect(findings).toEqual([]);
  });

  test("the self-referencing hreflang counts as a declaration", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/guide/", {
        html: `<html><body></body></html>`,
        contentText: CYRILLIC,
        hreflangs: [
          { lang: "ja", href: "https://ex.com/guide" },
          { lang: "en", href: "https://ex.com/en/guide" },
        ],
      }),
    ]);
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('"ja"');
  });

  test("non-self hreflangs never count as declarations", () => {
    // English page pointing at a Japanese alternate: the ja entry describes
    // the OTHER page, so no mismatch fires here.
    const findings = languageMismatchRule([
      page("https://ex.com/en/guide", {
        html: `<html lang="en">`,
        contentText: ENGLISH,
        hreflangs: [{ lang: "ja", href: "https://ex.com/ja/guide" }],
      }),
    ]);
    expect(findings).toEqual([]);
  });

  test("pages with empty html are skipped", () => {
    const findings = languageMismatchRule([page("https://ex.com/", { contentText: CYRILLIC })]);
    expect(findings).toEqual([]);
  });
});

// Boundary: a page with EXACTLY MIN_CLASSIFIED_LETTERS (200) classified
// letters. Found by mutation testing, which flipped `total <
// MIN_CLASSIFIED_LETTERS` to `<=` and the suite stayed green: every fixture
// sits comfortably above the floor, so nothing pinned the floor itself.
// The constant is a MINIMUM to analyse, so 200 must be analysed, not skipped.
// Getting this wrong is silent by construction: the rule just stops reporting.
describe("language-mismatch classified-letter floor", () => {
  // One Cyrillic letter per char, so length IS the classified-letter count.
  const cyr = (n: number) => "б".repeat(n);

  test("a page with exactly 200 classified letters is still analysed", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/a", { html: `<html lang="en"></html>`, contentText: cyr(200) }),
    ]);
    expect(findings.filter((f) => f.ruleId === "tech/language-mismatch")).not.toHaveLength(0);
  });

  test("a page one letter below the floor is skipped", () => {
    const findings = languageMismatchRule([
      page("https://ex.com/a", { html: `<html lang="en"></html>`, contentText: cyr(199) }),
    ]);
    expect(findings.filter((f) => f.severity === "error")).toHaveLength(0);
  });
});
