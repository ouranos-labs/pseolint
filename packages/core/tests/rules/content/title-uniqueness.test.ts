import { describe, expect, test } from "vitest";
import { titleUniquenessRule } from "../../../src/rules/content/title-uniqueness.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, title: string, extra: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url,
    title,
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
    html: "",
    ...extra,
  };
}

describe("titleUniquenessRule", () => {
  test("emits an error when a page has no title", () => {
    const findings = titleUniquenessRule([page("https://ex.com/a", "")]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("no <title>");
  });

  test("emits a diagnostic naming the SVG-title trap when the only title is an inline SVG", () => {
    const findings = titleUniquenessRule([
      page("https://ex.com/episodes/42", "", { titleSource: "none", svgTitleSample: "Spotify" }),
    ]);
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.severity).toBe("error");
    expect(f.message).toContain("SVG");
    expect(f.message).toContain("Spotify");
    // It must NOT fall back to the generic missing-title wording alone.
    expect(f.message).not.toBe(
      "https://ex.com/episodes/42 has no <title> element (or its title is empty)."
    );
  });

  test("emits the generic missing-title message when there is no SVG title", () => {
    const findings = titleUniquenessRule([
      page("https://ex.com/a", "", { titleSource: "none" }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("no <title>");
    expect(findings[0].message).not.toContain("SVG");
  });

  test("emits an error when two pages share the exact title", () => {
    const findings = titleUniquenessRule([
      page("https://ex.com/a", "Pricing, pseolint"),
      page("https://ex.com/b", "Pricing, pseolint"),
    ]);
    const dup = findings.find((f) => f.message.includes("share the exact title"));
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe("error");
  });

  test("does NOT emit when titles differ by entity (catalog records)", () => {
    // The rule does raw comparison, not entity-masked, so catalog templates
    // like "Slack to Google Sheets integration" vs "Slack to Airtable
    // integration" are correctly treated as distinct.
    const findings = titleUniquenessRule([
      page("https://ex.com/integrations/slack-google-sheets", "Slack to Google Sheets integration"),
      page("https://ex.com/integrations/slack-airtable", "Slack to Airtable integration"),
    ]);
    expect(findings.find((f) => f.message.includes("share the exact title"))).toBeUndefined();
  });

  test("warns on titles short enough to read as an unfilled template field", () => {
    const findings = titleUniquenessRule([page("https://ex.com/a", "| Acme")]);
    const short = findings.find((f) => f.message.includes("template field"));
    expect(short).toBeDefined();
    expect(short!.severity).toBe("warning");
    // The wording must cite the documented rewrite trigger, not a character limit.
    expect(short!.fix).toContain("Site Name");
  });

  // Google's documented example of a title link it replaces is the literal
  // "| Site Name": the separator and boilerplate survive, the record does not.
  // Detecting that SHAPE is what recovers the case a length floor cannot see -
  // "Equity Atlas -" is 14 characters and was previously waved through.
  test.each([
    ["| Acme Corp", "opens with a separator"],
    ["Equity Atlas -", "ends with a separator"],
    ["Best Plumbers \u2013", "ends with a separator"],
    ["Reviews | | Acme", "two separators in a row"],
    ["{{city}} Plumbers | Acme", "unsubstituted template placeholder"],
    ["${city} Plumbers | Acme", "unsubstituted template placeholder"],
    ["Plumbers in %s | Acme", "unsubstituted template placeholder"],
    ["[CITY] Plumbers | Acme", "unsubstituted template placeholder"],
    ["undefined | Acme", 'rendered as "undefined"'],
    ["Acme | null", 'rendered as "null"'],
  ])("flags the empty-slot shape %j regardless of length", (title, reason) => {
    const findings = titleUniquenessRule([page("https://ex.com/a", title)]);
    const f = findings.find((x) => x.message.includes("template field"));
    expect(f, `expected an empty-slot finding for ${title}`).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.message).toContain(reason);
  });

  // The empty-slot check must not become a tax on ordinary punctuation. Every
  // title here is well-formed; a false positive costs the reader's attention on
  // a correct page, which is the same failure mode as the length folklore.
  test.each([
    "Emergency Plumber in Phoenix | FastPlumb",
    "Best burial insurance companies of 2024 | CNN Underscored Money",
    "Amex Gold Vs. Platinum: Which Is Better For You? \u2013 Forbes Advisor",
    "Understanding null in JavaScript",
    "None of the Above: A History",
    // `--` as an em dash must not read as an empty middle slot.
    "Best Plumbers--Phoenix Edition",
    "10% Off In March 2024 | Ace Hardware Coupons | SFGate",
    "The Hair Pin - Empower. Engage. Enlighten.",
    "Anna Baryshnikov Height, Weight, Age, Boyfriend, Family, Biography",
  ])("leaves the well-formed title %j alone", (title) => {
    const findings = titleUniquenessRule([page("https://ex.com/a", title)]);
    expect(findings).toEqual([]);
  });

  // docs/folklore.md entry #2: Google documents no <title> character limit at
  // all ("While there's no limit on how long a <title> element can be"), and
  // SERP cropping is display-side and pixel-based. A rule that flagged a long
  // title would be the exact folklore the /folklore page refuses to ship.
  test("never flags a long title, at any length", () => {
    const findings = titleUniquenessRule([
      page("https://ex.com/a", "A".repeat(80)),
      page("https://ex.com/b", "B".repeat(300)),
    ]);
    expect(findings).toEqual([]);
  });

  test("makes no claim about truncation or character counts anywhere in its output", () => {
    const findings = titleUniquenessRule([
      page("https://ex.com/a", ""),
      page("https://ex.com/b", "Hi"),
      page("https://ex.com/c", "Shared title"),
      page("https://ex.com/d", "Shared title"),
      page("https://ex.com/e", "C".repeat(120)),
    ]);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      const text = `${f.message} ${f.fix ?? ""}`;
      expect(text).not.toMatch(/truncat/i);
      expect(text).not.toMatch(/\b60 characters\b/);
      expect(text).not.toMatch(/\b70 characters\b/);
    }
  });
});
