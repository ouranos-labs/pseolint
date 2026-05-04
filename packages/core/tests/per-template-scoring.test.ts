/**
 * Tests for v0.6 per-template scoring (packages/core/src/per-template-scoring.ts).
 *
 * Covers:
 *  - Per-template verdict, risk, categories computed correctly from fixture findings
 *  - Variance metric: high-uniformity vs low-uniformity templates
 *  - Top driver = highest fire-rate rule
 *  - Site verdict via §15.1: worst-template ≥5% coverage; falls through when none meet threshold
 */

import { describe, it, expect } from "vitest";
import { scoreTemplates, siteVerdictFromTemplates, verdictRank } from "../src/per-template-scoring.js";
import { LONGTAIL_SIGNATURE } from "../src/template-detection.js";
import type { RuleResult } from "../src/types.js";
import type { TemplateCandidate } from "../src/template-detection.js";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeCandidate(
  signature: string,
  urls: string[],
  total: number,
): TemplateCandidate {
  return {
    signature,
    urls,
    count: urls.length,
    ratio: urls.length / total,
  };
}

function makeFinding(
  ruleId: string,
  pageUrl: string,
  severity: RuleResult["severity"] = "error",
): RuleResult {
  return { ruleId, severity, message: `${ruleId} on ${pageUrl}`, pageUrl };
}

function listingUrls(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://example.com/listing/item-${i + 1}`);
}

function categoryUrls(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `https://example.com/category/cat-${i + 1}`);
}

// ---------------------------------------------------------------------------
// Per-template verdict, risk, categories
// ---------------------------------------------------------------------------

describe("scoreTemplates — per-template verdict and risk", () => {
  it("clean template (no findings) gets verdict=ready and risk=0", () => {
    const urls = listingUrls(5);
    const candidate = makeCandidate("/listing/:slug", urls, 10);
    const templates = scoreTemplates([], [candidate], new Map(), 10);
    expect(templates).toHaveLength(1);
    expect(templates[0]!.verdict).toBe("ready");
    expect(templates[0]!.risk).toBe(0);
  });

  it("template with many error findings gets verdict=critical or concerning", () => {
    const urls = listingUrls(10);
    // 10 thin-content errors + 5 near-duplicate errors
    const findings: RuleResult[] = [
      ...urls.map((u) => makeFinding("spam/thin-content", u, "error")),
      ...urls.slice(0, 5).map((u) => makeFinding("spam/near-duplicate", u, "critical")),
    ];
    const candidate = makeCandidate("/listing/:slug", urls, 20);
    const urlToTemplate = new Map(urls.map((u) => [u, "/listing/:slug"]));
    const templates = scoreTemplates(findings, [candidate], urlToTemplate, 20);
    expect(verdictRank(templates[0]!.verdict)).toBeGreaterThanOrEqual(verdictRank("concerning"));
  });

  it("template with only info findings stays at ready or caution", () => {
    const urls = listingUrls(5);
    const findings: RuleResult[] = urls.map((u) =>
      makeFinding("aeo/citable-facts", u, "info"),
    );
    const candidate = makeCandidate("/listing/:slug", urls, 10);
    const urlToTemplate = new Map(urls.map((u) => [u, "/listing/:slug"]));
    const templates = scoreTemplates(findings, [candidate], urlToTemplate, 10);
    // Info-only findings should produce low risk
    expect(templates[0]!.risk).toBeLessThan(40);
  });

  it("multiple templates are scored independently", () => {
    const lu = listingUrls(10);
    const cu = categoryUrls(10);
    const allUrls = [...lu, ...cu];
    // Only listing URLs have errors
    const findings: RuleResult[] = lu.map((u) => makeFinding("spam/thin-content", u, "error"));
    const candidates = [
      makeCandidate("/listing/:slug", lu, allUrls.length),
      makeCandidate("/category/:slug", cu, allUrls.length),
    ];
    const urlToTemplate = new Map([
      ...lu.map((u) => [u, "/listing/:slug"] as [string, string]),
      ...cu.map((u) => [u, "/category/:slug"] as [string, string]),
    ]);
    const templates = scoreTemplates(findings, candidates, urlToTemplate, allUrls.length);

    const listing = templates.find((t) => t.signature === "/listing/:slug");
    const category = templates.find((t) => t.signature === "/category/:slug");

    expect(listing).toBeDefined();
    expect(category).toBeDefined();
    // Listing should be worse than category
    expect(verdictRank(listing!.verdict)).toBeGreaterThan(verdictRank(category!.verdict));
    expect(listing!.risk).toBeGreaterThan(category!.risk);
  });

  it("tagging: findings get template field set", () => {
    const urls = listingUrls(5);
    const findings: RuleResult[] = urls.map((u) => makeFinding("spam/thin-content", u));
    const candidate = makeCandidate("/listing/:slug", urls, 10);
    const urlToTemplate = new Map(urls.map((u) => [u, "/listing/:slug"]));
    scoreTemplates(findings, [candidate], urlToTemplate, 10);
    for (const f of findings) {
      expect(f.template).toBe("/listing/:slug");
    }
  });
});

// ---------------------------------------------------------------------------
// Variance metric
// ---------------------------------------------------------------------------

describe("scoreTemplates — variance metric", () => {
  it("high-uniformity: all URLs fire the same rules → uniformityScore near 1", () => {
    const urls = listingUrls(10);
    // Every URL fires the same rule
    const findings: RuleResult[] = urls.map((u) => makeFinding("spam/thin-content", u));
    const candidate = makeCandidate("/listing/:slug", urls, 20);
    const urlToTemplate = new Map(urls.map((u) => [u, "/listing/:slug"]));
    const templates = scoreTemplates(findings, [candidate], urlToTemplate, 20);
    const variance = templates[0]!.variance;
    // stdev of [1,1,1,1,1,1,1,1,1,1] = 0 → uniformity = 1 - 0 = 1
    expect(variance.uniformityScore).toBeCloseTo(1, 2);
  });

  it("low-uniformity: URLs fire different rules → uniformityScore near 0.5", () => {
    const urls = listingUrls(10);
    // Half fire ruleA, other half fire ruleB
    const findings: RuleResult[] = [
      ...urls.slice(0, 5).map((u) => makeFinding("spam/thin-content", u)),
      ...urls.slice(5).map((u) => makeFinding("spam/near-duplicate", u)),
    ];
    const candidate = makeCandidate("/listing/:slug", urls, 20);
    const urlToTemplate = new Map(urls.map((u) => [u, "/listing/:slug"]));
    const templates = scoreTemplates(findings, [candidate], urlToTemplate, 20);
    const variance = templates[0]!.variance;
    // Each rule fires on 5/10 = 50% of URLs. stdev of binary (50%/50%) = 0.527
    // So uniformity = 1 - 0.527 ≈ 0.47 — not near 1
    expect(variance.uniformityScore).toBeLessThan(0.7);
  });

  it("no findings → uniformityScore = 1 and topDriver = null", () => {
    const urls = listingUrls(5);
    const candidate = makeCandidate("/listing/:slug", urls, 10);
    const templates = scoreTemplates([], [candidate], new Map(), 10);
    const variance = templates[0]!.variance;
    expect(variance.uniformityScore).toBe(1);
    expect(variance.topDriver).toBeNull();
  });

  it("top driver = highest fire-rate rule", () => {
    const urls = listingUrls(10);
    // ruleA fires on 8/10, ruleB fires on 3/10 — ruleA should be top driver
    const findings: RuleResult[] = [
      ...urls.slice(0, 8).map((u) => makeFinding("spam/thin-content", u)),
      ...urls.slice(0, 3).map((u) => makeFinding("aeo/citable-facts", u, "info")),
    ];
    const candidate = makeCandidate("/listing/:slug", urls, 20);
    const urlToTemplate = new Map(urls.map((u) => [u, "/listing/:slug"]));
    const templates = scoreTemplates(findings, [candidate], urlToTemplate, 20);
    const variance = templates[0]!.variance;
    expect(variance.topDriver).not.toBeNull();
    expect(variance.topDriver!.ruleId).toBe("spam/thin-content");
    expect(variance.topDriver!.fireRate).toBeCloseTo(0.8, 2);
  });

  it("ruleFireRates correct — fires on 5/10 samples = 0.5", () => {
    const urls = listingUrls(10);
    const findings: RuleResult[] = urls.slice(0, 5).map((u) =>
      makeFinding("spam/thin-content", u),
    );
    const candidate = makeCandidate("/listing/:slug", urls, 20);
    const urlToTemplate = new Map(urls.map((u) => [u, "/listing/:slug"]));
    const templates = scoreTemplates(findings, [candidate], urlToTemplate, 20);
    const variance = templates[0]!.variance;
    expect(variance.ruleFireRates["spam/thin-content"]).toBeCloseTo(0.5, 2);
  });
});

// ---------------------------------------------------------------------------
// siteVerdictFromTemplates — §15.1 aggregation
// ---------------------------------------------------------------------------

describe("siteVerdictFromTemplates — §15.1 worst-template ≥5% coverage", () => {
  it("worst verdict among qualifying templates wins", () => {
    const urls = listingUrls(10);
    const cu = categoryUrls(10);
    const allUrls = [...urls, ...cu];
    const findings: RuleResult[] = [
      ...urls.map((u) => makeFinding("spam/thin-content", u, "critical")),
    ];
    const candidates = [
      makeCandidate("/listing/:slug", urls, allUrls.length),
      makeCandidate("/category/:slug", cu, allUrls.length),
    ];
    const urlToTemplate = new Map([
      ...urls.map((u) => [u, "/listing/:slug"] as [string, string]),
      ...cu.map((u) => [u, "/category/:slug"] as [string, string]),
    ]);
    const templates = scoreTemplates(findings, candidates, urlToTemplate, allUrls.length);
    const siteVerdict = siteVerdictFromTemplates(templates);
    // listing is critical, category is ready — worst wins
    expect(siteVerdict).not.toBeNull();
    expect(verdictRank(siteVerdict!)).toBeGreaterThanOrEqual(verdictRank("concerning"));
  });

  it("returns null when no template meets 5% coverage threshold", () => {
    // Total 1000 URLs but each template has only 4 (0.4%) — below 5%
    const totalDiscovered = 1000;
    const urls = listingUrls(4);
    const findings: RuleResult[] = urls.map((u) =>
      makeFinding("spam/thin-content", u, "critical"),
    );
    const candidates = [
      { signature: "/listing/:slug", urls, count: 4, ratio: 4 / totalDiscovered },
      { signature: "/category/:slug", urls: categoryUrls(4), count: 4, ratio: 4 / totalDiscovered },
    ];
    const urlToTemplate = new Map(urls.map((u) => [u, "/listing/:slug"]));
    const templates = scoreTemplates(findings, candidates, urlToTemplate, totalDiscovered);
    const siteVerdict = siteVerdictFromTemplates(templates);
    expect(siteVerdict).toBeNull();
  });

  it("longtail template is excluded from verdict aggregation", () => {
    // Only longtail template with critical findings — site verdict should be null
    const urls = listingUrls(10);
    const findings: RuleResult[] = urls.map((u) =>
      makeFinding("spam/thin-content", u, "critical"),
    );
    // Longtail at 50% coverage but excluded by spec
    const candidates = [
      { signature: LONGTAIL_SIGNATURE, urls, count: 10, ratio: 0.5 },
    ];
    const urlToTemplate = new Map(urls.map((u) => [u, LONGTAIL_SIGNATURE]));
    const templates = scoreTemplates(findings, candidates, urlToTemplate, 20);
    const siteVerdict = siteVerdictFromTemplates(templates);
    expect(siteVerdict).toBeNull();
  });

  it("all-ready templates produce ready verdict", () => {
    const lu = listingUrls(50);
    const cu = categoryUrls(50);
    const allUrls = [...lu, ...cu];
    // No findings → all ready
    const candidates = [
      makeCandidate("/listing/:slug", lu, allUrls.length),
      makeCandidate("/category/:slug", cu, allUrls.length),
    ];
    const templates = scoreTemplates([], candidates, new Map(), allUrls.length);
    const siteVerdict = siteVerdictFromTemplates(templates);
    expect(siteVerdict).toBe("ready");
  });

  it("empty templates array returns null", () => {
    expect(siteVerdictFromTemplates([])).toBeNull();
  });
});
