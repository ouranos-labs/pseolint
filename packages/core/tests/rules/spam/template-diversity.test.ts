import { describe, expect, test } from "vitest";
import { templateDiversityRule } from "../../../src/rules/spam/template-diversity.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, structureSignature: string): ParsedPage {
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
    structureSignature,
    contentText: "",
    html: ""
  };
}

describe("templateDiversityRule — chrome-tolerant coarsening", () => {
  // (a) The false negative the exact-count fingerprint caused: pages from ONE template
  // whose signatures differ only by trivial count noise (an extra ad div, a conditional
  // nav item) used to read as fully unique. Coarsening collapses them → low ratio → fires.
  test("fires when single-template pages differ only by minor count noise", () => {
    const pages = [
      page("/a", "div:42|p:8|a:15"),
      page("/b", "div:43|p:8|a:16"),
      page("/c", "div:44|p:9|a:14"),
      page("/d", "div:41|p:8|a:15"),
      page("/e", "div:45|p:9|a:16"),
    ];
    const findings = templateDiversityRule(pages, 0.5);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("spam/template-diversity");
    expect(findings[0].severity).toBe("warning");
  });

  // (b) Genuinely diverse layouts (order-of-magnitude / different tags) do NOT collapse → no finding.
  test("does not fire when pages are genuinely structurally diverse", () => {
    const pages = [
      page("/home", "div:4|h1:1|nav:1"),
      page("/article", "div:40|p:80|h2:12|figure:6"),
      page("/product", "div:200|li:150|span:300|button:40"),
      page("/contact", "form:1|input:6|div:8"),
    ];
    const findings = templateDiversityRule(pages, 0.5);
    expect(findings).toHaveLength(0);
  });

  // (c) Confidence band: ratio far below the floor → high; just under → medium.
  test("reports high confidence when ratio is far below the floor", () => {
    // All 6 pages coarsen to the same shape → ratio 1/6 ≈ 0.17, well under 0.5/2=0.25.
    const pages = Array.from({ length: 6 }, (_, i) => page(`/p${i}`, `div:${40 + i}|p:8`));
    const findings = templateDiversityRule(pages, 0.5);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("high");
  });

  test("reports medium confidence when ratio is just under the floor", () => {
    // 4 pages, 2 distinct coarse shapes → ratio 0.5; with floor 0.6 it fires but
    // 0.5 >= 0.6/2=0.3, so medium.
    const pages = [
      page("/a", "div:42|p:8"),
      page("/b", "div:43|p:8"),
      page("/c", "section:10|article:4"),
      page("/d", "section:11|article:4"),
    ];
    const findings = templateDiversityRule(pages, 0.6);
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe("medium");
  });

  test("returns empty for an empty corpus", () => {
    expect(templateDiversityRule([], 0.5)).toHaveLength(0);
  });
});
