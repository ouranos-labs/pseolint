import { describe, it, expect } from "vitest";
import { inferUrlTemplate, stratifiedSample, mulberry32 } from "../src/stratified-sample.js";

describe("inferUrlTemplate", () => {
  it("generalizes multi-hyphen slugs", () => {
    expect(inferUrlTemplate("https://example.com/templates/lawyer-nda-ca"))
      .toBe("/templates/:slug");
  });

  it("keeps short static segments literal", () => {
    expect(inferUrlTemplate("https://example.com/blog/about"))
      .toBe("/blog/about");
  });

  it("generalizes all-digits", () => {
    expect(inferUrlTemplate("https://example.com/items/12345"))
      .toBe("/items/:num");
  });

  it("generalizes UUIDs", () => {
    expect(inferUrlTemplate("https://example.com/u/550e8400-e29b-41d4-a716-446655440000"))
      .toBe("/u/:id");
  });

  it("generalizes date-shaped segments", () => {
    expect(inferUrlTemplate("https://example.com/archive/2026-04-17/post"))
      .toBe("/archive/:date/post");
  });

  it("handles root URL", () => {
    expect(inferUrlTemplate("https://example.com/")).toBe("/");
    expect(inferUrlTemplate("https://example.com")).toBe("/");
  });

  it("single-hyphen segments stay literal", () => {
    expect(inferUrlTemplate("https://example.com/page-2")).toBe("/page-2");
  });
});

describe("stratifiedSample", () => {
  it("returns all URLs when n >= total", () => {
    const urls = ["https://example.com/a", "https://example.com/b"];
    expect(stratifiedSample(urls, 10)).toEqual(expect.arrayContaining(urls));
    expect(stratifiedSample(urls, 10)).toHaveLength(2);
  });

  it("single cluster → uniform random (bounded to n)", () => {
    const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/blog/post${i}`);
    const sampled = stratifiedSample(urls, 20);
    expect(sampled).toHaveLength(20);
    expect(new Set(sampled).size).toBe(20);
  });

  it("multi-cluster: every cluster gets at least 1 sample when n >= clusterCount", () => {
    const urls = [
      ...Array.from({ length: 90 }, (_, i) => `https://example.com/blog/my-post-${i}`),
      ...Array.from({ length: 8 }, (_, i) => `https://example.com/templates/role-doc-${i}a-${i}b`),
      ...Array.from({ length: 2 }, (_, i) => `https://example.com/archive/2026-04-${String(i + 1).padStart(2, "0")}/x`),
    ];
    const sampled = stratifiedSample(urls, 20);
    expect(sampled.length).toBeLessThanOrEqual(20);
    const byTemplate = new Map<string, number>();
    for (const u of sampled) {
      const key = u.includes("/blog/") ? "blog" : u.includes("/templates/") ? "templates" : "archive";
      byTemplate.set(key, (byTemplate.get(key) ?? 0) + 1);
    }
    expect(byTemplate.get("blog")).toBeGreaterThanOrEqual(1);
    expect(byTemplate.get("templates")).toBeGreaterThanOrEqual(1);
    expect(byTemplate.get("archive")).toBeGreaterThanOrEqual(1);
  });

  it("sqrt allocation over-samples small clusters", () => {
    const big = Array.from({ length: 900 }, (_, i) => `https://example.com/big/${i}`);
    const mid = Array.from({ length: 90 }, (_, i) => `https://example.com/mid/item-a-${i}/x`);
    const small = Array.from({ length: 10 }, (_, i) => `https://example.com/small/tiny-a-${i}/x`);
    const sampled = stratifiedSample([...big, ...mid, ...small], 60);
    const counts = { big: 0, mid: 0, small: 0 };
    for (const u of sampled) {
      if (u.startsWith("https://example.com/big/")) counts.big += 1;
      else if (u.startsWith("https://example.com/mid/")) counts.mid += 1;
      else counts.small += 1;
    }
    expect(counts.small).toBeGreaterThanOrEqual(2);
    expect(counts.mid).toBeGreaterThanOrEqual(5);
    expect(counts.big).toBeLessThan(60);
  });
});

describe("seeded sampling (mulberry32)", () => {
  // 2026-05-03 calibration credibility fix: round-to-round verdict drift
  // was partially driven by Math.random — same engine, same site,
  // different sample, different verdict. With sampleSeed plumbed through
  // stratifiedSample, repeated runs against the same URL set produce the
  // same audit, so verdicts are reproducible for CI gates and calibration.

  it("produces identical samples for the same seed", () => {
    const urls = Array.from({ length: 200 }, (_, i) => `https://x.com/s/${i}`);
    const a = stratifiedSample(urls, 25, mulberry32(1729));
    const b = stratifiedSample(urls, 25, mulberry32(1729));
    expect(a).toEqual(b);
  });

  it("produces different samples for different seeds", () => {
    const urls = Array.from({ length: 200 }, (_, i) => `https://x.com/s/${i}`);
    const a = stratifiedSample(urls, 25, mulberry32(1));
    const b = stratifiedSample(urls, 25, mulberry32(2));
    // Both contain the same number of items and are subsets of the input,
    // but the chosen URLs should differ — they were drawn from a different
    // PRNG state.
    expect(a).not.toEqual(b);
  });

  it("default Math.random call still works (backward compatible)", () => {
    const urls = Array.from({ length: 200 }, (_, i) => `https://x.com/s/${i}`);
    const sample = stratifiedSample(urls, 25);
    expect(sample).toHaveLength(25);
  });
});
