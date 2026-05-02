import { describe, it, expect } from "vitest";
import { parsePageTool } from "../../../src/ai/tools/parse-page.js";
import { withCachedPage } from "../../helpers/page-cache-test.js";

const richHtml = `
<!doctype html>
<html lang="en">
<head>
  <title>How to bake sourdough</title>
  <meta name="description" content="A practical guide.">
  <link rel="canonical" href="https://example.com/sourdough">
  <meta name="robots" content="index,follow">
  <meta name="author" content="Jane Doe">
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}
  </script>
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Article","headline":"x"}
  </script>
</head>
<body>
  <h1>Sourdough basics</h1>
  <h2>Starter</h2>
  <h2>Bake</h2>
  <p>${"word ".repeat(80)}</p>
  <a href="/about">About</a>
  <a href="https://example.com/recipes">Recipes</a>
  <a href="https://other.com/external">External</a>
</body>
</html>
`;

describe("parse_page tool", () => {
  it("extracts title, meta, canonical, robots, headings", async () => {
    await withCachedPage("https://example.com/sourdough", richHtml, async (pageId) => {
      const r = await parsePageTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.title).toBe("How to bake sourdough");
      expect(r.data.metaDescription).toBe("A practical guide.");
      expect(r.data.canonical).toBe("https://example.com/sourdough");
      expect(r.data.robotsMeta).toBe("index,follow");
      expect(r.data.headings.h1).toEqual(["Sourdough basics"]);
      expect(r.data.headings.h2).toEqual(["Starter", "Bake"]);
    });
  });

  it("counts JSON-LD blocks and surfaces unique types", async () => {
    await withCachedPage("https://example.com/sourdough", richHtml, async (pageId) => {
      const r = await parsePageTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.jsonLdBlockCount).toBe(2);
      expect(r.data.jsonLdTypes).toEqual(expect.arrayContaining(["FAQPage", "Article"]));
      expect(r.data.hasFaqBlock).toBe(true);
    });
  });

  it("classifies links as internal vs external by host", async () => {
    await withCachedPage("https://example.com/sourdough", richHtml, async (pageId) => {
      const r = await parsePageTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.internalLinkCount).toBeGreaterThanOrEqual(2);
      expect(r.data.outboundLinkCount).toBeGreaterThanOrEqual(1);
    });
  });

  it("detects author signal from meta[name=author]", async () => {
    await withCachedPage("https://example.com/sourdough", richHtml, async (pageId) => {
      const r = await parsePageTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.hasAuthorSignal).toBe(true);
    });
  });

  it("handles a minimal page with no JSON-LD or author", async () => {
    const html = "<html><head><title>x</title></head><body><h1>x</h1></body></html>";
    await withCachedPage("https://example.com/", html, async (pageId) => {
      const r = await parsePageTool.run({ pageId });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.data.jsonLdBlockCount).toBe(0);
      expect(r.data.jsonLdTypes).toEqual([]);
      expect(r.data.hasFaqBlock).toBe(false);
      expect(r.data.hasAuthorSignal).toBe(false);
    });
  });

  it("rejects an unknown pageId", async () => {
    const r = await parsePageTool.run({ pageId: "deadbeefdeadbeef" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errorCode).toBe("EXECUTE_ERROR");
      expect(r.error).toMatch(/page cache|unknown pageId/i);
    }
  });
});
