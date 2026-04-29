import { describe, expect, it } from "vitest";
import { enrichFindings } from "../src/enrich-findings.js";
import type { RuleResult, ParsedPage } from "../src/types.js";

function makeFinding(ruleId: string, pageUrl: string, relatedUrl: string, similarity: number): RuleResult {
  return {
    ruleId, severity: "critical", message: `${pageUrl} and ${relatedUrl} are near-duplicates.`,
    pageUrl, relatedUrls: [relatedUrl], similarity,
  };
}

function makePage(url: string, content: string = "default content for testing purposes that is long enough"): ParsedPage {
  return {
    url, title: url, metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: content, html: `<html><body>${content}</body></html>`,
  };
}

describe("fix strings — template-aware", () => {
  it("includes 'template' language when template detected", () => {
    const findings: RuleResult[] = [];
    for (let i = 0; i < 10; i++) {
      findings.push(makeFinding("spam/entity-swap", `https://a.com/${i}`, `https://a.com/${i + 1}`, 0.96));
    }
    findings.push({ ruleId: "spam/template-diversity", severity: "warning", message: "Low diversity." });
    for (let i = 0; i < 5; i++) {
      findings.push(makeFinding("spam/near-duplicate", `https://a.com/${i}`, `https://a.com/${i + 1}`, 0.90));
    }
    const pages = Array.from({ length: 11 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages);
    const ndCluster = result.findings.find((f) => f.ruleId === "spam/near-duplicate" && f.context?.type === "cluster");
    expect(ndCluster?.fix).toContain("template");
    expect(ndCluster?.fix).toContain("conditional");
  });

  it("does not include 'template' language when template not detected", () => {
    const findings: RuleResult[] = [
      makeFinding("spam/near-duplicate", "https://a.com/1", "https://a.com/2", 0.90),
    ];
    const pages = [makePage("https://a.com/1"), makePage("https://a.com/2")];
    const result = enrichFindings(findings, pages);
    const cluster = result.findings.find((f) => f.context?.type === "cluster");
    expect(cluster?.fix).not.toContain("template");
    expect(cluster?.fix).toContain("Differentiate");
  });

  it("rewrites per-page fix for template sites with > 5 affected pages", () => {
    const findings: RuleResult[] = Array.from({ length: 6 }, (_, i) => ({
      ruleId: "tech/canonical-consistency" as const,
      severity: "warning" as const,
      message: "Missing canonical.",
      pageUrl: `https://a.com/${i}`,
      fix: "Add <link rel=\"canonical\"> to each page.",
    }));
    const pages = Array.from({ length: 6 }, (_, i) => makePage(`https://a.com/${i}`));
    const result = enrichFindings(findings, pages, { templateGenerated: true });
    expect(result.findings[0].fix).toContain("template");
  });
});
