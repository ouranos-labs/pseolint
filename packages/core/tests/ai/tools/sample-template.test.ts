import { describe, it, expect } from "vitest";
import { sampleTemplateTool } from "../../../src/ai/tools/sample-template.js";

describe("sample_template tool", () => {
  it("returns N URLs stratified across templates when no template is given", async () => {
    const urls = [
      ...Array.from({ length: 50 }, (_, i) => `https://example.com/city/place-${i}`),
      ...Array.from({ length: 50 }, (_, i) => `https://example.com/blog/post-${i}`),
    ];
    const r = await sampleTemplateTool.run({ urls, n: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sample).toHaveLength(10);
    expect(r.data.template).toBeNull();
    // Stratified should pull from both templates — at least 1 each.
    const cityCount = r.data.sample.filter((u) => u.includes("/city/")).length;
    const blogCount = r.data.sample.filter((u) => u.includes("/blog/")).length;
    expect(cityCount).toBeGreaterThanOrEqual(1);
    expect(blogCount).toBeGreaterThanOrEqual(1);
  });

  it("restricts sampling to a named template when provided", async () => {
    // Use hyphenated slugs so the normalizer collapses them into one template.
    const urls = [
      "https://example.com/city/los-angeles",
      "https://example.com/city/san-francisco",
      "https://example.com/city/new-york",
      "https://example.com/blog/launching-pseolint",
      "https://example.com/blog/state-of-pseo",
    ];
    // sample_template uses inferUrlTemplate (stratified-sample.ts) directly,
    // not the site-classifier normalizer — but both produce identical
    // ":slug" output for hyphenated multi-word segments, so /city/:slug
    // is the canonical key here too.
    const r = await sampleTemplateTool.run({ urls, n: 2, template: "/city/:slug" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sample).toHaveLength(2);
    expect(r.data.sample.every((u) => u.includes("/city/"))).toBe(true);
    expect(r.data.template).toBe("/city/:slug");
    expect(r.data.sampledFrom).toBe(3);
  });

  it("returns empty sample when template matches nothing", async () => {
    const r = await sampleTemplateTool.run({
      urls: ["https://example.com/a", "https://example.com/b"],
      n: 5,
      template: "/does/not/exist",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sample).toEqual([]);
    expect(r.data.sampledFrom).toBe(0);
  });

  it("rejects n > 500 via Zod", async () => {
    const r = await sampleTemplateTool.run({
      urls: ["https://example.com/a"],
      n: 501,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });
});
