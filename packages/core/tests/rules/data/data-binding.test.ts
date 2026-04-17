import { describe, expect, it } from "vitest";
import { dataBindingRule, dataIdenticalRule } from "../../../src/rules/data/data-binding.js";
import type { ParsedPage, PageDataRecord } from "../../../src/types.js";

function makePage(url: string, content: string): ParsedPage {
  return {
    url, title: url, metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: content, html: `<html><body>${content}</body></html>`,
  };
}

describe("dataBindingRule", () => {
  it("flags missing string fields", () => {
    const pages = [makePage("/templates/california-llc", "Form a California LLC today. Filing fee applies.")];
    const records: PageDataRecord[] = [
      { url: "/templates/california-llc", data: { state: "California", filingFee: "$70", processingTime: "2-3 weeks" } },
    ];
    const findings = dataBindingRule(pages, records);
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain("processingTime");
    // "California" and "$70" should NOT be flagged (they're short or present)
  });

  it("returns no findings when all data appears on page", () => {
    const pages = [makePage("/templates/california-llc", "California LLC filing fee is $70. Processing time is 2-3 weeks.")];
    const records: PageDataRecord[] = [
      { url: "/templates/california-llc", data: { state: "California", filingFee: "$70", processingTime: "2-3 weeks" } },
    ];
    const findings = dataBindingRule(pages, records);
    expect(findings).toHaveLength(0);
  });

  it("checks array items (e.g., FAQs)", () => {
    const pages = [makePage("/templates/california-llc", "Some content but no FAQ answers here.")];
    const records: PageDataRecord[] = [
      { url: "/templates/california-llc", data: {
        faqs: [
          { question: "How long does it take?", answer: "Filing takes 2-3 weeks in California." },
          { question: "What is the cost?", answer: "The filing fee is $70 for a California LLC." },
        ],
      }},
    ];
    const findings = dataBindingRule(pages, records);
    expect(findings.length).toBe(1);
    expect(findings[0].message).toContain("faqs");
  });

  it("flags unmatched data source records", () => {
    const pages = [makePage("/templates/california-llc", "California content")];
    const records: PageDataRecord[] = [
      { url: "/templates/california-llc", data: { state: "California" } },
      { url: "/templates/texas-llc", data: { state: "Texas" } },
      { url: "/templates/florida-llc", data: { state: "Florida" } },
    ];
    const findings = dataBindingRule(pages, records);
    const unmatched = findings.find((f) => f.message.includes("no matching page"));
    expect(unmatched).toBeDefined();
    expect(unmatched!.message).toContain("2 data source records");
  });
});

describe("dataIdenticalRule", () => {
  it("flags fields with identical values across many pages", () => {
    const pages = [
      makePage("/templates/california-llc", ""),
      makePage("/templates/texas-llc", ""),
      makePage("/templates/florida-llc", ""),
      makePage("/templates/ohio-llc", ""),
    ];
    const records: PageDataRecord[] = pages.map((p) => ({
      url: p.url,
      data: { description: "This is a generic LLC formation document for any state." },
    }));
    const findings = dataIdenticalRule(pages, records);
    expect(findings.length).toBe(1);
    expect(findings[0].ruleId).toBe("data/identical-across-pages");
    expect(findings[0].message).toContain("description");
    expect(findings[0].message).toContain("4 pages");
  });

  it("does not flag fields with unique values", () => {
    const pages = [
      makePage("/templates/california-llc", ""),
      makePage("/templates/texas-llc", ""),
    ];
    const records: PageDataRecord[] = [
      { url: "/templates/california-llc", data: { description: "California LLC formation guide with state-specific details." } },
      { url: "/templates/texas-llc", data: { description: "Texas LLC formation guide with Lone Star state requirements." } },
    ];
    const findings = dataIdenticalRule(pages, records);
    expect(findings).toHaveLength(0);
  });
});
