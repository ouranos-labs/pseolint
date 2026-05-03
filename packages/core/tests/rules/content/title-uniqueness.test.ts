import { describe, expect, test } from "vitest";
import { titleUniquenessRule } from "../../../src/rules/content/title-uniqueness.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, title: string): ParsedPage {
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
  };
}

describe("titleUniquenessRule", () => {
  test("emits an error when a page has no title", () => {
    const findings = titleUniquenessRule([page("https://ex.com/a", "")]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("no <title>");
  });

  test("emits an error when two pages share the exact title", () => {
    const findings = titleUniquenessRule([
      page("https://ex.com/a", "Pricing — pseolint"),
      page("https://ex.com/b", "Pricing — pseolint"),
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

  test("warns on very short titles", () => {
    const findings = titleUniquenessRule([page("https://ex.com/a", "Hi")]);
    const short = findings.find((f) => f.message.includes("short title"));
    expect(short).toBeDefined();
    expect(short!.severity).toBe("warning");
  });

  test("emits info on excessively long titles", () => {
    const longTitle = "A".repeat(80);
    const findings = titleUniquenessRule([page("https://ex.com/a", longTitle)]);
    const long = findings.find((f) => f.message.includes("long title"));
    expect(long).toBeDefined();
    expect(long!.severity).toBe("info");
  });
});
