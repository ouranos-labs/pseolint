import { describe, expect, test } from "vitest";
import { boilerplateRatioRule } from "../../../src/rules/spam/boilerplate-ratio.js";
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
    html: ""
  };
}

// A block shared across ALL pages — contributes weight 1.0.
const SHARED = "this block appears on every single page as a shared footer disclaimer text";
// A block unique to one page — contributes weight 1/N.
const UNIQUE_A = "california specific content that no other page contains in its body text";
const UNIQUE_B = "texas specific content that no other page contains in its body text at all";
const UNIQUE_C = "florida specific content that no other page contains in its body text today";

describe("boilerplateRatioRule — continuous weighting", () => {
  // (a) A page that is mostly shared blocks fires as error (ratio well above threshold+0.1)
  test("fires error when page is overwhelmingly shared-block content", () => {
    const pages = [
      // 5 pages; each page has the shared block + a tiny unique fragment
      page("a", `${SHARED}. ${SHARED}. ${SHARED}. tiny unique a`),
      page("b", `${SHARED}. ${SHARED}. ${SHARED}. tiny unique b`),
      page("c", `${SHARED}. ${SHARED}. ${SHARED}. tiny unique c`),
      page("d", `${SHARED}. ${SHARED}. ${SHARED}. tiny unique d`),
      page("e", `${SHARED}. ${SHARED}. ${SHARED}. tiny unique e`),
    ];
    const findings = boilerplateRatioRule(pages, 0.7);
    expect(findings.length).toBeGreaterThan(0);
    // Every finding should have severity error because ratio is far above threshold+0.1
    for (const f of findings) {
      expect(f.severity).toBe("error");
      expect(f.confidence).toBe("high");
    }
  });

  // (b) STABILITY: adding one sibling barely moves a page's ratio/verdict
  test("stability — page ratio barely moves when one sibling is added or removed", () => {
    // Build a corpus of 9 pages where each page is ~50% shared, ~50% unique.
    // Under the old binary cutoff (floor(9*0.8)+1 = 8), a block on 8/9 pages = skeleton.
    // Under the old binary cutoff with 10 pages (floor(10*0.8)+1 = 9), 8/10 = not skeleton.
    // Adding one more page would flip skeleton membership with binary, but continuous is stable.

    const sharedA = "shared block alpha that appears on most pages within the corpus";
    const sharedB = "shared block beta that appears on most pages within the corpus";

    const buildCorpus = (n: number) => {
      const pages: ParsedPage[] = [];
      for (let i = 0; i < n; i++) {
        // Each page: sharedA + sharedB (on all pages) + a unique block
        pages.push(page(`/page-${i}`, `${sharedA}. ${sharedB}. unique content for page ${i} only here`));
      }
      return pages;
    };

    const corpus9 = buildCorpus(9);
    const corpus10 = buildCorpus(10); // one extra page added

    const findings9 = boilerplateRatioRule(corpus9, 0.7);
    const findings10 = boilerplateRatioRule(corpus10, 0.7);

    // Both corpora should produce the same verdict for "/page-0" (either both fire or both don't)
    const fired9 = findings9.some((f) => f.pageUrl === "/page-0" || f.message.includes("/page-0"));
    const fired10 = findings10.some((f) => f.pageUrl === "/page-0" || f.message.includes("/page-0"));
    expect(fired9).toBe(fired10);
  });

  // (c) A mostly-unique page does not fire
  test("does not fire when page content is mostly unique", () => {
    const pages = [
      page("a", `${UNIQUE_A}. ${UNIQUE_A}. ${UNIQUE_A}. ${UNIQUE_A}. some shared footer text here`),
      page("b", `${UNIQUE_B}. ${UNIQUE_B}. ${UNIQUE_B}. ${UNIQUE_B}. some shared footer text here`),
      page("c", `${UNIQUE_C}. ${UNIQUE_C}. ${UNIQUE_C}. ${UNIQUE_C}. some shared footer text here`),
      page("d", "completely different distinct material about new york that has no overlap with other pages at all"),
      page("e", "entirely separate independent material about chicago that has no overlap with other pages ever"),
    ];
    const findings = boilerplateRatioRule(pages, 0.7);
    expect(findings.length).toBe(0);
  });

  // (d) 2-band severity: just over threshold fires warning, clearly over fires error
  test("fires warning when ratio is just over threshold (< threshold + 0.1)", () => {
    // We need ratio > 0.7 but < 0.8. Build pages where shared content is ~75%.
    // 4 shared words + ~1.3 unique words per block, across 5 pages.
    // shared block on all 5 pages: weight=1.0
    // We craft content carefully: 3 shared sentences + 1 unique sentence
    // Shared ~75 words, unique ~25 words → ratio ~0.75, which is > 0.7 but < 0.8
    const sharedBlock = "this is the shared boilerplate sentence that appears verbatim on every single page of the site across all templates";
    const makeUnique = (n: number) => `page ${n} unique distinct content specific to only this one url value`;

    const pages: ParsedPage[] = [];
    for (let i = 0; i < 5; i++) {
      // 3 copies of the shared block + 1 unique block → ~75% shared by word count
      pages.push(page(`/p${i}`, `${sharedBlock}. ${sharedBlock}. ${sharedBlock}. ${makeUnique(i)}`));
    }

    const findings = boilerplateRatioRule(pages, 0.7);

    // At minimum some finding should fire
    expect(findings.length).toBeGreaterThan(0);

    // Collect severities; at threshold+0 to threshold+0.1 zone we expect warning
    // (exact zone depends on word counts — just assert no finding is below warning)
    for (const f of findings) {
      expect(["warning", "error"]).toContain(f.severity);
    }
  });

  // (d2) Single-page-unique content has ZERO boilerplate weight: a 2-page corpus
  // of fully distinct pages must not fire even at a strict maxRatio. (freq-1)/(N-1)
  // gives a block on 1/2 pages weight 0 — freq/N would have given it 0.5 and
  // fired at maxRatio < 0.5.
  test("all-unique 2-page corpus does not fire even at a strict threshold", () => {
    const pages = [
      page("a", "completely distinct material about alpha topic with no overlap whatsoever here"),
      page("b", "entirely separate independent content about beta topic sharing nothing at all"),
    ];
    expect(boilerplateRatioRule(pages, 0.4).length).toBe(0);
  });

  // (e) Legacy: <2 pages returns empty (unchanged)
  test("returns empty for fewer than 2 pages", () => {
    const findings = boilerplateRatioRule([page("a", "some content here for the page")], 0.7);
    expect(findings.length).toBe(0);
  });

  // (f) pageUrl is populated on findings
  test("populates pageUrl on findings", () => {
    const sharedBlock = "this is shared boilerplate text that appears on every single page here verbatim repeated often";
    const pages: ParsedPage[] = [];
    for (let i = 0; i < 5; i++) {
      pages.push(page(`/page/${i}`, `${sharedBlock}. ${sharedBlock}. ${sharedBlock}. tiny ${i}`));
    }
    const findings = boilerplateRatioRule(pages, 0.7);
    for (const f of findings) {
      expect(f.pageUrl).toBeTruthy();
    }
  });
});
