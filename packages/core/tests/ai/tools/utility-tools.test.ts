import { describe, it, expect } from "vitest";
import { checkIndexabilityTool } from "../../../src/ai/tools/check-indexability.js";
import { validateJsonLdTool } from "../../../src/ai/tools/validate-jsonld.js";
import { withCachedPage } from "../../helpers/page-cache-test.js";

describe("check_indexability tool", () => {
  it("returns indexable=true on a self-canonical page with no robots restrictions", async () => {
    const html = `
      <html><head>
        <title>x</title>
        <link rel="canonical" href="https://example.com/a">
      </head><body><h1>x</h1></body></html>`;
    await withCachedPage("https://example.com/a", html, async (pageId) => {
      const r = await checkIndexabilityTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.indexable).toBe(true);
      expect(r.data.reasons).toEqual([]);
    });
  });

  it("flags meta robots noindex", async () => {
    const html = `
      <html><head>
        <title>x</title>
        <meta name="robots" content="noindex,follow">
      </head><body></body></html>`;
    await withCachedPage("https://example.com/a", html, async (pageId) => {
      const r = await checkIndexabilityTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.indexable).toBe(false);
      expect(r.data.metaNoindex).toBe(true);
      expect(r.data.reasons.some((s) => /noindex/.test(s))).toBe(true);
    });
  });

  it("flags X-Robots-Tag noindex from header arg", async () => {
    const html = `<html><head><title>x</title></head><body></body></html>`;
    await withCachedPage("https://example.com/a", html, async (pageId) => {
      const r = await checkIndexabilityTool.run({
        pageId,
        xRobotsTagHeader: "noindex, nofollow",
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.indexable).toBe(false);
      expect(r.data.xRobotsNoindex).toBe(true);
    });
  });

  it("auto-pulls X-Robots-Tag from cached fetch headers", async () => {
    const html = `<html><head><title>x</title></head><body></body></html>`;
    await withCachedPage(
      "https://example.com/a",
      html,
      async (pageId) => {
        const r = await checkIndexabilityTool.run({ pageId });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.data.xRobotsNoindex).toBe(true);
        expect(r.data.indexable).toBe(false);
      },
      200,
      { "x-robots-tag": "noindex" },
    );
  });

  it("flags non-self-referencing canonical", async () => {
    const html = `
      <html><head>
        <title>x</title>
        <link rel="canonical" href="https://other.example.com/elsewhere">
      </head><body></body></html>`;
    await withCachedPage("https://example.com/a", html, async (pageId) => {
      const r = await checkIndexabilityTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.indexable).toBe(false);
      expect(r.data.canonicalSelfReferencing).toBe(false);
    });
  });
});

describe("validate_jsonld tool", () => {
  const wrap = (jsonld: object) => `
    <html><head>
      <title>x</title>
      <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
    </head><body></body></html>`;

  it("reports ok=true on a fully-populated Article block", async () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: "Hello",
      datePublished: "2026-04-29",
      author: { "@type": "Person", name: "Jane" },
    });
    await withCachedPage("https://example.com/a", html, async (pageId) => {
      const r = await validateJsonLdTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.totalBlocks).toBe(1);
      expect(r.data.okBlocks).toBe(1);
      expect(r.data.blocks[0].missingRequired).toEqual([]);
    });
  });

  it("flags missing required Article fields", async () => {
    const html = wrap({ "@context": "https://schema.org", "@type": "Article" });
    await withCachedPage("https://example.com/a", html, async (pageId) => {
      const r = await validateJsonLdTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.okBlocks).toBe(0);
      expect(r.data.blocks[0].missingRequired).toEqual(
        expect.arrayContaining(["headline", "datePublished", "author"]),
      );
    });
  });

  it("returns 0 blocks for a page with no JSON-LD", async () => {
    const html = `<html><head><title>x</title></head><body></body></html>`;
    await withCachedPage("https://example.com/a", html, async (pageId) => {
      const r = await validateJsonLdTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.totalBlocks).toBe(0);
      expect(r.data.okBlocks).toBe(0);
    });
  });

  it("handles a FAQPage block with mainEntity", async () => {
    const html = wrap({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A" } }],
    });
    await withCachedPage("https://example.com/a", html, async (pageId) => {
      const r = await validateJsonLdTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.okBlocks).toBe(1);
      expect(r.data.blocks[0].types).toEqual(["FAQPage"]);
    });
  });
});
