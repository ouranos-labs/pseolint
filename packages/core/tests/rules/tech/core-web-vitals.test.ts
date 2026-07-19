import { describe, it, expect } from "vitest";
import { coreWebVitalsRule } from "../../../src/rules/tech/core-web-vitals.js";
import type { ParsedPage } from "../../../src/types.js";

function page(p: Partial<ParsedPage> & { url: string }): ParsedPage {
  return { contentText: "", title: "", html: "", url: p.url, ...p } as ParsedPage;
}

describe("core-web-vitals", () => {
  it("flags poor LCP", () => {
    const out = coreWebVitalsRule([page({ url: "https://x.com/a", webVitals: { lcp: 6000, cls: 0.02, ttfb: 200 } })]);
    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBe("tech/core-web-vitals");
    expect(out[0].message).toMatch(/LCP 6000ms/);
  });

  it("flags poor CLS", () => {
    const out = coreWebVitalsRule([page({ url: "https://x.com/b", webVitals: { lcp: 1200, cls: 0.4, ttfb: 100 } })]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toMatch(/CLS 0\.400/);
  });

  it("does not flag good vitals", () => {
    expect(coreWebVitalsRule([page({ url: "https://x.com/c", webVitals: { lcp: 2000, cls: 0.05, ttfb: 80 } })])).toHaveLength(0);
  });

  it("does not flag the needs-improvement tier (between good and poor)", () => {
    // LCP 3000ms and CLS 0.15 are both "needs improvement", not "poor" — reported, not flagged.
    expect(coreWebVitalsRule([page({ url: "https://x.com/d", webVitals: { lcp: 3000, cls: 0.15, ttfb: 90 } })])).toHaveLength(0);
  });

  it("no-ops when webVitals is absent (render off)", () => {
    expect(coreWebVitalsRule([page({ url: "https://x.com/e" })])).toHaveLength(0);
  });

  it("tolerates null metric fields", () => {
    expect(coreWebVitalsRule([page({ url: "https://x.com/f", webVitals: { lcp: null, cls: null, ttfb: null } })])).toHaveLength(0);
  });

  it("flags poor INP from field data (field-only metric)", () => {
    const out = coreWebVitalsRule([page({ url: "https://x.com/g", fieldVitals: { lcp: 1800, cls: 0.02, inp: 640, source: "url" } })]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toMatch(/INP 640ms/);
    expect(out[0].message).toMatch(/real-user p75/);
    expect(out[0].confidence).toBe("high");
  });

  it("prefers field data over lab when both present", () => {
    // Lab says poor LCP; field says LCP is fine → field wins, no finding.
    const out = coreWebVitalsRule([page({
      url: "https://x.com/h",
      webVitals: { lcp: 9000, cls: 0.9, ttfb: 100 },
      fieldVitals: { lcp: 2000, cls: 0.05, inp: 150, source: "url" },
    })]);
    expect(out).toHaveLength(0);
  });

  it("labels origin-level field data as a site-level fallback", () => {
    const out = coreWebVitalsRule([page({ url: "https://x.com/i", fieldVitals: { lcp: 5000, cls: 0.05, inp: 150, source: "origin" } })]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toMatch(/origin-level/);
  });
});
