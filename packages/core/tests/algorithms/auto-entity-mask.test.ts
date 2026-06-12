import { describe, test, expect } from "vitest";
import { deriveEntityPatterns } from "../../src/algorithms/auto-entity-mask.js";
import { maskEntities } from "../../src/algorithms/entity-mask.js";

function page(url: string, contentText: string) {
  return { url, contentText };
}

describe("deriveEntityPatterns — URL-slug varying tokens", () => {
  test("masks the varying city token, not the constant template words", () => {
    const pages = ["austin", "dallas", "houston"].map((c) =>
      page(`https://x.test/emergency-plumber-${c}`, `Emergency Plumber in ${c}`),
    );
    const patterns = deriveEntityPatterns(pages, { contentDiff: false });
    const masked = maskEntities("emergency plumber austin dallas", patterns);
    expect(masked).toContain("emergency plumber"); // constant words survive
    expect(masked).not.toMatch(/\baustin\b/i);     // varying tokens masked
    expect(masked).not.toMatch(/\bdallas\b/i);
  });

  test("ignores clusters smaller than minClusterSize", () => {
    const pages = [page("https://x.test/widget-austin", "a"), page("https://x.test/widget-dallas", "b")];
    expect(deriveEntityPatterns(pages, { minClusterSize: 3 })).toEqual([]);
  });
});

describe("deriveEntityPatterns — content-diff varying tokens", () => {
  test("masks a capitalized entity that varies across siblings, not shared headings", () => {
    const pages = ["Austin", "Dallas", "Houston"].map((c, i) =>
      page(`https://x.test/p${i}`, `Overview Section. Our office in ${c} serves clients.`),
    );
    // /p0../p2 normalize to distinct literal templates → put them in one cluster via shared slug
    const clustered = ["austin", "dallas", "houston"].map((c) =>
      page(`https://x.test/office-${c}-directory`, `Overview Section. Our office in ${c[0].toUpperCase()+c.slice(1)} serves clients.`),
    );
    const patterns = deriveEntityPatterns(clustered, { urlSlug: false });
    expect(maskEntities("Austin", patterns)).not.toMatch(/austin/i);
    expect(maskEntities("Overview Section", patterns)).toContain("Overview Section"); // shared → survives
  });
});

describe("deriveEntityPatterns — guards & determinism", () => {
  test("returns identical patterns on repeat runs (deterministic)", () => {
    const pages = ["austin", "dallas", "houston"].map((c) => page(`https://x.test/plumber-${c}`, `Plumber ${c}`));
    const a = deriveEntityPatterns(pages);
    const b = deriveEntityPatterns(pages);
    expect(a.map((p) => p.pattern.source)).toEqual(b.map((p) => p.pattern.source));
  });

  test("escapes regex metacharacters in tokens", () => {
    const pages = ["a.b", "c.d", "e.f"].map((s, i) => page(`https://x.test/x-${s}-${i}`, `t ${s}`));
    // should not throw when building the RegExp
    expect(() => deriveEntityPatterns(pages)).not.toThrow();
  });

  test("returns [] when no qualifying clusters", () => {
    expect(deriveEntityPatterns([])).toEqual([]);
  });

  test("skips common stopwords even if they vary", () => {
    const pages = ["the-austin", "and-dallas", "for-houston"].map((s) => page(`https://x.test/${s}-page`, "x"));
    const patterns = deriveEntityPatterns(pages, { contentDiff: false });
    expect(maskEntities("the and for", patterns)).toContain("the and for");
  });
});
