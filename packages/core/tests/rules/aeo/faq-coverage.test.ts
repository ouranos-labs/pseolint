import { describe, expect, test } from "vitest";
import { faqCoverageRule } from "../../../src/rules/aeo/faq-coverage.js";
import { page } from "./page-fixture.js";

describe("aeo/faq-coverage", () => {
  test("flags question-style H2s with no FAQPage schema", () => {
    const p = page("https://example.dev/llc", {
      headings: {
        h1: ["LLC Filing"],
        h2: [
          "How much does a California LLC cost?",
          "How long does it take to form an LLC?",
        ],
      },
    });
    const findings = faqCoverageRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toMatch(/no FAQPage/);
    // FAQ-shape detection is heuristic → always medium confidence.
    expect(findings[0].confidence).toBe("medium");
  });

  test("does not flag when FAQPage JSON-LD is present", () => {
    const p = page("https://example.dev/llc", {
      headings: {
        h1: ["LLC"],
        h2: ["How much does an LLC cost?", "What is an LLC?"],
      },
      jsonLd: [{ "@context": "https://schema.org", "@type": "FAQPage" }],
    });
    expect(faqCoverageRule([p])).toHaveLength(0);
  });

  test("accepts HowTo schema as coverage", () => {
    const p = page("https://example.dev/how-to-file-llc", {
      headings: { h1: ["How to file"], h2: ["How do I start?", "What forms do I need?"] },
      jsonLd: [{ "@context": "https://schema.org", "@type": "HowTo" }],
    });
    expect(faqCoverageRule([p])).toHaveLength(0);
  });

  test("triggers on URL pattern even without question headings", () => {
    const p = page("https://example.dev/how-to-file-an-llc", {
      headings: { h1: ["Filing an LLC"], h2: ["Requirements", "Fees"] },
    });
    const findings = faqCoverageRule([p]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/FAQ pattern/);
  });

  test("does not flag pages with <minQuestionHeadings and no URL signal", () => {
    const p = page("https://example.dev/about", {
      headings: { h1: ["About"], h2: ["How we work"] },
    });
    expect(faqCoverageRule([p])).toHaveLength(0);
  });

  test("respects custom minQuestionHeadings threshold", () => {
    const p = page("https://example.dev/a", {
      headings: { h1: ["A"], h2: ["What is X?"] },
    });
    expect(faqCoverageRule([p], { minQuestionHeadings: 1 })).toHaveLength(1);
  });

  test("recognizes nested FAQPage @type inside a @graph", () => {
    const p = page("https://example.dev/llc", {
      headings: {
        h1: ["LLC"],
        h2: ["How much does an LLC cost?", "What is an LLC?"],
      },
      jsonLd: [{ "@graph": [{ "@type": "FAQPage" }] }],
    });
    expect(faqCoverageRule([p])).toHaveLength(0);
  });
});
