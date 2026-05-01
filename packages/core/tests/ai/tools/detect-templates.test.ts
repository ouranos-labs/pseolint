import { describe, it, expect } from "vitest";
import { detectTemplatesTool } from "../../../src/ai/tools/detect-templates.js";

describe("detect_templates tool", () => {
  it("groups URLs by template pattern (hyphenated slugs cluster as :slug)", async () => {
    // pseolint's normalizer only collapses hyphenated multi-word slugs and
    // numeric segments — bare single words like "austin" stay literal so
    // /about and /blog don't collide with detail-page templates.
    const urls = [
      "https://example.com/city/los-angeles",
      "https://example.com/city/san-francisco",
      "https://example.com/city/new-york",
      "https://example.com/blog/launching-pseolint",
      "https://example.com/blog/state-of-pseo",
      "https://example.com/about",
    ];
    const r = await detectTemplatesTool.run({ urls });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.totalUrls).toBe(6);
    expect(r.data.templateCount).toBeGreaterThanOrEqual(2);

    const cityTemplate = r.data.templates.find((t) => t.count === 3);
    expect(cityTemplate).toBeDefined();
    expect(cityTemplate!.template).toBe("/city/:slug");
  });

  it("filters templates below minRatio", async () => {
    const urls = [
      ...Array.from({ length: 95 }, (_, i) => `https://example.com/city/some-place-${i}`),
      "https://example.com/about",
      "https://example.com/contact",
      "https://example.com/pricing",
      "https://example.com/blog",
      "https://example.com/legal",
    ];
    const r = await detectTemplatesTool.run({ urls, minRatio: 0.1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Only the /city/:slug template clears the 10% threshold (95% of URLs).
    expect(r.data.templates).toHaveLength(1);
    expect(r.data.templates[0].count).toBe(95);
    expect(r.data.templates[0].ratio).toBeGreaterThanOrEqual(0.9);
  });

  it("rejects empty url list via Zod", async () => {
    const r = await detectTemplatesTool.run({ urls: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("INPUT_VALIDATION");
  });
});
