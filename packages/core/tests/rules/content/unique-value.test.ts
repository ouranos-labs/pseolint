import { describe, expect, test } from "vitest";
import { uniqueValueRule } from "../../../src/rules/content/unique-value.js";
import type { ParsedPage } from "../../../src/types.js";

const TH = { passBelow: 0.2, errorBelow: 0.12 };

function page(url: string, contentText: string): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [], structureSignature: "", contentText, html: "",
  };
}

// A big shared boilerplate block + a tiny page-specific tail = near-duplicate shape.
const SHARED = Array.from({ length: 40 }, (_, i) => `shared${i}`).join(" ");
// n distinct page-exclusive words → high density.
function original(url: string, n: number): ParsedPage {
  return page(url, Array.from({ length: n }, (_, i) => `${url}word${i}`).join(" "));
}

describe("uniqueValueRule (density)", () => {
  test("near-duplicate pages (mostly shared) fire error", () => {
    const pages = [page("a", `${SHARED} aonly`), page("b", `${SHARED} bonly`)];
    const f = uniqueValueRule(pages, TH).find((x) => x.pageUrl === "a");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("error");
    expect(f!.ruleId).toBe("content/unique-value");
  });

  test("a page of page-exclusive words clears", () => {
    const pages = [original("a", 60), original("b", 60)];
    expect(uniqueValueRule(pages, TH)).toEqual([]);
  });

  test("stability: an original page's verdict doesn't flip when a sibling is added", () => {
    const base = [original("a", 60), original("b", 60)];
    const grown = [...base, original("c", 60), original("d", 60), original("e", 60)];
    const firedA = (ps: ParsedPage[]) => uniqueValueRule(ps, TH).some((x) => x.pageUrl === "a");
    expect(firedA(base)).toBe(false);
    expect(firedA(grown)).toBe(false); // would shuffle under the old absolute-count rule
  });

  test("corpus-size invariance: same original page passes in a small and a large same-topic corpus", () => {
    const small = [original("a", 50), page("b", `${SHARED} bonly`)];
    const large = [original("a", 50), ...Array.from({ length: 30 }, (_, i) => page(`s${i}`, `${SHARED} s${i}only`))];
    const firedA = (ps: ParsedPage[]) => uniqueValueRule(ps, TH).some((x) => x.pageUrl === "a");
    expect(firedA(small)).toBe(false);
    expect(firedA(large)).toBe(false);
  });

  test("length invariance: a short all-original page is not penalized for being short", () => {
    const pages = [original("a", 8), page("b", `${SHARED} bonly`)];
    expect(uniqueValueRule(pages, TH).some((x) => x.pageUrl === "a")).toBe(false);
  });

  test("borderline density fires info, not error", () => {
    const half = Array.from({ length: 40 }, (_, i) => `aw${i}`).join(" ");
    const pages = [page("a", `${SHARED} ${half}`), page("b", `${SHARED} bonly`)];
    const f = uniqueValueRule(pages, { passBelow: 0.6, errorBelow: 0.12 }).find((x) => x.pageUrl === "a");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("info");
  });

  test("single-page corpus never fires (can't measure rarity)", () => {
    expect(uniqueValueRule([page("a", `${SHARED} aonly`)], TH)).toEqual([]);
  });

  test("message reports density and shared overlap; fix warns axis-shared doesn't count", () => {
    const f = uniqueValueRule([page("a", `${SHARED} aonly`), page("b", `${SHARED} bonly`)], TH)
      .find((x) => x.pageUrl === "a");
    expect(f!.message).toMatch(/density \d+\.\d+/);
    expect(f!.fix).toMatch(/does NOT/i);
  });
});
