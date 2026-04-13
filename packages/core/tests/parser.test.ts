import { describe, expect, test } from "vitest";
import { parseHtmlPage } from "../src/parser.js";

describe("parseHtmlPage", () => {
  test("extracts title, metadata, headings, and cleaned content text", () => {
    const html = `
      <html>
        <head>
          <title>California LLC Template</title>
          <meta name="description" content="A practical filing guide." />
          <link rel="canonical" href="https://example.dev/templates/california-llc" />
          <meta name="robots" content="index,follow" />
          <meta property="og:title" content="OG California LLC Template" />
          <meta property="og:description" content="OG filing guide summary." />
          <meta property="og:image" content="https://example.dev/og.png" />
          <link rel="alternate" hreflang="en-US" href="https://example.dev/en/california-llc" />
          <meta property="article:published_time" content="2026-04-01" />
        </head>
        <body>
          <header>Global nav should be removed</header>
          <main>
            <h1>California LLC Template</h1>
            <h2>Filing Requirements</h2>
            <a href="./next-step.html">next</a>
            <p>California has a publication rule in some counties.</p>
          </main>
          <footer>Footer should be removed</footer>
        </body>
      </html>
    `;

    const parsed = parseHtmlPage(html, "https://example.dev/templates/california-llc");

    expect(parsed.url).toBe("https://example.dev/templates/california-llc");
    expect(parsed.title).toBe("California LLC Template");
    expect(parsed.metaDescription).toBe("A practical filing guide.");
    expect(parsed.canonical).toBe("https://example.dev/templates/california-llc");
    expect(parsed.robotsMeta).toBe("index,follow");
    expect(parsed.og.title).toBe("OG California LLC Template");
    expect(parsed.og.description).toBe("OG filing guide summary.");
    expect(parsed.og.image).toBe("https://example.dev/og.png");
    expect(parsed.hreflangs).toEqual([
      { lang: "en-US", href: "https://example.dev/en/california-llc" }
    ]);
    expect(parsed.publishedDate).toBe("2026-04-01");
    expect(parsed.headings.h1).toEqual(["California LLC Template"]);
    expect(parsed.headings.h2).toEqual(["Filing Requirements"]);
    expect(parsed.resolvedHrefs.some((link) => link.endsWith("next-step.html"))).toBe(true);
  });

  test("drops javascript: and keeps only http(s) on web page URLs", () => {
    const html = `
      <html><body>
        <a href="javascript:void(0)">js</a>
        <a href="#frag">hash</a>
        <a href="https://example.dev/only-offsite">ext</a>
        <a href="./local.html">rel</a>
      </body></html>`;
    const parsed = parseHtmlPage(html, "https://example.dev/templates/page");
    expect(parsed.resolvedHrefs).toContain("https://example.dev/only-offsite");
    expect(parsed.resolvedHrefs.some((u) => u.includes("local.html"))).toBe(true);
    expect(parsed.resolvedHrefs.some((u) => u.includes("javascript"))).toBe(false);
  });
});
