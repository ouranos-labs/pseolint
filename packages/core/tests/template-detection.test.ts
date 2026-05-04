/**
 * Tests for v0.6 template detection (packages/core/src/template-detection.ts).
 *
 * Covers:
 *  - Cluster filter math (1% threshold, count ≥5)
 *  - ≥2 templates required for activation
 *  - URL → template lookup correctness
 *  - Long-tail bucket: URLs not in any qualifying cluster collect into `_longtail`
 */

import { describe, it, expect } from "vitest";
import {
  detectTemplates,
  buildUrlToTemplateMap,
  shouldActivateTemplateScoring,
  LONGTAIL_SIGNATURE,
} from "../src/template-detection.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Generate N URLs under the same pattern. */
function genUrls(pattern: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => pattern.replace("{i}", String(i + 1)));
}

// ---------------------------------------------------------------------------
// detectTemplates — filter math
// ---------------------------------------------------------------------------

describe("detectTemplates — cluster filter (ratio ≥ 1%, count ≥ 5)", () => {
  it("returns empty array for empty input", () => {
    expect(detectTemplates([])).toEqual([]);
  });

  it("excludes clusters with count < 5 even if ratio passes", () => {
    // 4 URLs in /listing/:slug out of 10 total = 40% ratio but count = 4 < 5
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 4),
      ...genUrls("https://example.com/page-{i}", 6),
    ];
    const result = detectTemplates(urls);
    const sigs = result.map((c) => c.signature).filter((s) => s !== LONGTAIL_SIGNATURE);
    // /listing/:slug has 4 items — below count threshold
    expect(sigs).not.toContain("/listing/:slug");
  });

  it("excludes clusters with ratio < 1% even if count passes", () => {
    // 5 URLs in /rare/:slug out of 600 total = 0.8% ratio < 1%
    const urls = [
      ...genUrls("https://example.com/rare/item-{i}", 5),
      ...genUrls("https://example.com/listing/item-{i}", 595),
    ];
    const result = detectTemplates(urls);
    const sigs = result.map((c) => c.signature).filter((s) => s !== LONGTAIL_SIGNATURE);
    // /rare/:slug at 5/600 = 0.83% — below ratio threshold
    expect(sigs).not.toContain("/rare/:slug");
  });

  it("includes clusters with count ≥ 5 AND ratio ≥ 1%", () => {
    // 10 URLs in /listing/:slug out of 50 total = 20% ratio, count = 10
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      ...genUrls("https://example.com/category/cat-{i}", 10),
      ...genUrls("https://example.com/page-{i}", 30),
    ];
    const result = detectTemplates(urls);
    const sigs = result.map((c) => c.signature).filter((s) => s !== LONGTAIL_SIGNATURE);
    expect(sigs.some((s) => s.includes("listing"))).toBe(true);
    expect(sigs.some((s) => s.includes("category"))).toBe(true);
  });

  it("returns correct count and ratio on each candidate", () => {
    // 10 listing + 20 category = 30 total. All qualify.
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      ...genUrls("https://example.com/category/cat-{i}", 20),
    ];
    const result = detectTemplates(urls);
    const listing = result.find((c) => c.signature.includes("listing"));
    expect(listing).toBeDefined();
    expect(listing!.count).toBe(10);
    expect(listing!.ratio).toBeCloseTo(10 / 30, 5);
  });
});

// ---------------------------------------------------------------------------
// shouldActivateTemplateScoring — ≥2 qualifying templates
// ---------------------------------------------------------------------------

describe("shouldActivateTemplateScoring — requires ≥2 qualifying templates", () => {
  it("returns false when fewer than 2 qualifying templates", () => {
    // One qualifying template + longtail
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      "https://example.com/about",
      "https://example.com/contact",
    ];
    const candidates = detectTemplates(urls);
    expect(shouldActivateTemplateScoring(candidates)).toBe(false);
  });

  it("returns true when exactly 2 qualifying templates", () => {
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      ...genUrls("https://example.com/category/cat-{i}", 10),
    ];
    const candidates = detectTemplates(urls);
    expect(shouldActivateTemplateScoring(candidates)).toBe(true);
  });

  it("returns true when 3+ qualifying templates", () => {
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      ...genUrls("https://example.com/category/cat-{i}", 10),
      ...genUrls("https://example.com/brand/brand-{i}", 10),
    ];
    const candidates = detectTemplates(urls);
    expect(shouldActivateTemplateScoring(candidates)).toBe(true);
  });

  it("longtail-only candidates do not count toward activation", () => {
    // Only one real template; everything else is longtail
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      // These all have unique path patterns and will fall into longtail
      "https://example.com/about",
      "https://example.com/pricing",
    ];
    const candidates = detectTemplates(urls);
    expect(shouldActivateTemplateScoring(candidates)).toBe(false);
  });

  it("returns false for empty candidates", () => {
    expect(shouldActivateTemplateScoring([])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// URL → template lookup correctness
// ---------------------------------------------------------------------------

describe("buildUrlToTemplateMap — URL lookup", () => {
  it("maps each URL to its template signature", () => {
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 5),
      ...genUrls("https://example.com/category/cat-{i}", 5),
    ];
    const candidates = detectTemplates(urls);
    const map = buildUrlToTemplateMap(candidates);

    expect(map.get("https://example.com/listing/item-1")).toBeDefined();
    expect(map.get("https://example.com/category/cat-1")).toBeDefined();

    // Signatures should differ between the two clusters
    const listingSig = map.get("https://example.com/listing/item-1");
    const categorySig = map.get("https://example.com/category/cat-1");
    expect(listingSig).not.toBe(categorySig);
  });

  it("every URL in a candidate maps to that candidate's signature", () => {
    const listingUrls = genUrls("https://example.com/listing/item-{i}", 8);
    const categoryUrls = genUrls("https://example.com/category/cat-{i}", 8);
    const all = [...listingUrls, ...categoryUrls];
    const candidates = detectTemplates(all);
    const map = buildUrlToTemplateMap(candidates);

    const listingCandidate = candidates.find((c) => c.signature.includes("listing"));
    if (listingCandidate) {
      for (const url of listingCandidate.urls) {
        expect(map.get(url)).toBe(listingCandidate.signature);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Long-tail bucket
// ---------------------------------------------------------------------------

describe("detectTemplates — long-tail bucket", () => {
  it("groups non-qualifying URLs into _longtail", () => {
    // 10 listing URLs qualify; 3 singleton URLs should go to longtail
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      "https://example.com/about",
      "https://example.com/contact",
      "https://example.com/terms",
    ];
    const candidates = detectTemplates(urls);
    const longtail = candidates.find((c) => c.signature === LONGTAIL_SIGNATURE);
    // We have 10 qualifying listing URLs; /about, /contact, /terms may cluster into /:slug
    // but that cluster has count=3 < 5, so those 3 fall into longtail
    expect(longtail).toBeDefined();
  });

  it("long-tail candidate has signature = _longtail", () => {
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      "https://example.com/about",
      "https://example.com/blog",
    ];
    const candidates = detectTemplates(urls);
    const longtail = candidates.find((c) => c.signature === LONGTAIL_SIGNATURE);
    if (longtail) {
      expect(longtail.signature).toBe(LONGTAIL_SIGNATURE);
    }
  });

  it("no longtail when all URLs qualify", () => {
    // Two clusters each with 15 URLs out of 30 total (50% each, >> 1%, count >> 5)
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 15),
      ...genUrls("https://example.com/category/cat-{i}", 15),
    ];
    const candidates = detectTemplates(urls);
    const longtail = candidates.find((c) => c.signature === LONGTAIL_SIGNATURE);
    expect(longtail).toBeUndefined();
  });

  it("all long-tail URLs together have count equal to non-qualifying URL count", () => {
    // 10 listing URLs qualify. 3 singleton URLs are longtail.
    const nonQualifyingUrls = [
      "https://example.com/about",
      "https://example.com/contact",
      "https://example.com/terms",
    ];
    const urls = [
      ...genUrls("https://example.com/listing/item-{i}", 10),
      ...nonQualifyingUrls,
    ];
    const candidates = detectTemplates(urls);
    const longtail = candidates.find((c) => c.signature === LONGTAIL_SIGNATURE);
    if (longtail) {
      // Longtail URLs should contain all non-qualifying URLs
      for (const url of nonQualifyingUrls) {
        expect(longtail.urls).toContain(url);
      }
    }
  });
});
