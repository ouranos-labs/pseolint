import { describe, it, expect } from "vitest";
import { coreWebVitalsRule } from "../../../src/rules/tech/core-web-vitals.js";
import type { ParsedPage } from "../../../src/types.js";

function page(p: Partial<ParsedPage> & { url: string }): ParsedPage {
  return { contentText: "", title: "", html: "", url: p.url, ...p } as ParsedPage;
}

describe("core-web-vitals", () => {
  it("flags poor LCP from the lab render", () => {
    const out = coreWebVitalsRule([page({ url: "https://x.com/a", webVitals: { lcp: 6000, cls: 0.02, ttfb: 200 } })]);
    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBe("tech/core-web-vitals");
    expect(out[0].message).toMatch(/LCP 6000ms .*lab/);
    expect(out[0].confidence).toBe("medium");
  });

  it("flags poor CLS from the lab render", () => {
    const out = coreWebVitalsRule([page({ url: "https://x.com/b", webVitals: { lcp: 1200, cls: 0.4, ttfb: 100 } })]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toMatch(/CLS 0\.400 .*lab/);
  });

  it("does not flag good vitals", () => {
    expect(coreWebVitalsRule([page({ url: "https://x.com/c", webVitals: { lcp: 2000, cls: 0.05, ttfb: 80 } })])).toHaveLength(0);
  });

  it("does not flag the needs-improvement tier (between good and poor)", () => {
    expect(coreWebVitalsRule([page({ url: "https://x.com/d", webVitals: { lcp: 3000, cls: 0.15, ttfb: 90 } })])).toHaveLength(0);
  });

  it("no-ops when neither source is present (render off, no key)", () => {
    expect(coreWebVitalsRule([page({ url: "https://x.com/e" })])).toHaveLength(0);
  });

  it("tolerates null metric fields", () => {
    expect(coreWebVitalsRule([page({ url: "https://x.com/f", webVitals: { lcp: null, cls: null, ttfb: null } })])).toHaveLength(0);
  });

  it("flags poor INP from per-URL field data at high confidence (field-only metric)", () => {
    const out = coreWebVitalsRule([page({ url: "https://x.com/g", fieldVitals: { lcp: 1800, cls: 0.02, inp: 640, source: "url" } })]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toMatch(/INP 640ms .*real-user p75/);
    expect(out[0].confidence).toBe("high");
  });

  it("prefers per-URL field over lab for the same metric", () => {
    // field says LCP is bad (real-user), lab says fine → field wins, flagged high.
    const out = coreWebVitalsRule([page({
      url: "https://x.com/h",
      webVitals: { lcp: 1000, cls: 0.01, ttfb: 50 },
      fieldVitals: { lcp: 9000, cls: 0.01, inp: 100, source: "url" },
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toMatch(/LCP 9000ms .*real-user p75/);
    expect(out[0].confidence).toBe("high");
  });

  it("falls back to the lab metric when field lacks it (no coverage regression)", () => {
    // field has good LCP but NO CLS; lab shows a bad CLS → CLS must still flag (from lab).
    const out = coreWebVitalsRule([page({
      url: "https://x.com/i",
      webVitals: { lcp: 1500, cls: 0.5, ttfb: 60 },
      fieldVitals: { lcp: 2000, cls: null, inp: 150, source: "url" },
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toMatch(/CLS 0\.500 .*lab/);
    expect(out[0].message).not.toMatch(/LCP/); // field LCP was good
  });

  it("collapses origin-level field findings into one per origin", () => {
    const out = coreWebVitalsRule([
      page({ url: "https://x.com/p1", fieldVitals: { lcp: 5200, cls: 0.05, inp: 150, source: "origin" } }),
      page({ url: "https://x.com/p2", fieldVitals: { lcp: 5200, cls: 0.05, inp: 150, source: "origin" } }),
      page({ url: "https://x.com/p3", fieldVitals: { lcp: 5200, cls: 0.05, inp: 150, source: "origin" } }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pageUrl).toBe("https://x.com");
    expect(out[0].message).toMatch(/site-level/);
    expect(out[0].message).toMatch(/3 audited pages/);
    expect(out[0].confidence).toBe("medium"); // origin aggregate → not high
  });

  it("keeps a mixed origin-field + lab finding per-page (not collapsed)", () => {
    // origin field CLS is poor AND lab LCP is poor → page-specific lab metric present → per-page.
    const out = coreWebVitalsRule([page({
      url: "https://x.com/mixed",
      webVitals: { lcp: 8000, cls: 0.01, ttfb: 100 },
      fieldVitals: { lcp: null, cls: 0.4, inp: 100, source: "origin" },
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].pageUrl).toBe("https://x.com/mixed");
    expect(out[0].message).toMatch(/LCP 8000ms .*lab/);
    expect(out[0].message).toMatch(/CLS 0\.400 .*origin p75/);
  });
});
