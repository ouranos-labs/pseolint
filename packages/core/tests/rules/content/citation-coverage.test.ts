import { describe, it, expect } from "vitest";
import { citationCoverageRule } from "../../../src/rules/content/citation-coverage.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, html: string, contentText: string, hrefs: string[]): ParsedPage {
  return {
    url, title: "", titleSource: "none", metaDescription: "", canonical: "",
    robotsMeta: "", og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: hrefs, structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText, html,
  };
}

describe("content/citation-coverage", () => {
  it("fires when a page makes many quantified claims but cites no authoritative source", () => {
    const text = "Up 30%, down 12%, 45% growth, 3 days, $99, 7 weeks more.";
    const html = `<main><p>${text}</p></main>`;
    const findings = citationCoverageRule([page("https://x.test/a", html, text, [])], [], {});
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("content/citation-coverage");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("low");
  });

  it("stays silent when the page cites an authoritative source", () => {
    const text = "Up 30%, down 12%, 45% growth, 3 days, $99, 7 weeks.";
    const html = `<main><p>${text} <a href="https://epa.gov/x">EPA</a></p></main>`;
    const findings = citationCoverageRule(
      [page("https://x.test/a", html, text, ["https://epa.gov/x"])], [], {},
    );
    expect(findings).toHaveLength(0);
  });

  it("stays silent on a low-claim page (a blog/contact page)", () => {
    const text = "Welcome to my blog. I write about gardening and life.";
    const html = `<main><p>${text}</p></main>`;
    const findings = citationCoverageRule([page("https://x.test/a", html, text, [])], [], {});
    expect(findings).toHaveLength(0);
  });
});
