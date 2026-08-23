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

  test("ignores inline SVG <title> when there is no head title (the Spotify trap)", () => {
    // Page has NO <head><title> but an inline SVG logo carries a <title>.
    // An unscoped $("title") selector would pick up the SVG title and report
    // every such page as titled "Spotify". The head-scoped selector must not.
    const html = `
      <html>
        <head>
          <meta name="description" content="Episode notes." />
        </head>
        <body>
          <a href="/" aria-label="Home">
            <svg viewBox="0 0 24 24"><title>Spotify</title><path d="M0 0h24v24H0z"/></svg>
          </a>
          <main><h1>Episode 42</h1></main>
        </body>
      </html>`;

    const parsed = parseHtmlPage(html, "https://example.dev/episodes/42");

    expect(parsed.title).toBe("");
    expect(parsed.titleSource).toBe("none");
    expect(parsed.svgTitleSample).toBe("Spotify");
  });

  test("uses the head title and records titleSource=head (no svgTitleSample)", () => {
    const html = `
      <html>
        <head><title>Real Title</title></head>
        <body><main><h1>Real Title</h1></main></body>
      </html>`;

    const parsed = parseHtmlPage(html, "https://example.dev/real");

    expect(parsed.title).toBe("Real Title");
    expect(parsed.titleSource).toBe("head");
    expect(parsed.svgTitleSample).toBeUndefined();
  });

  test("head title wins even when an inline SVG <title> is also present", () => {
    const html = `
      <html>
        <head><title>Head Wins</title></head>
        <body>
          <svg><title>Spotify</title></svg>
          <main><h1>Head Wins</h1></main>
        </body>
      </html>`;

    const parsed = parseHtmlPage(html, "https://example.dev/both");

    expect(parsed.title).toBe("Head Wins");
    expect(parsed.titleSource).toBe("head");
    expect(parsed.svgTitleSample).toBeUndefined();
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
  // HTML metadata names are ASCII case-insensitive, but cheerio/css-select only
  // folds case for a fixed attribute list that does not include `name`. Without
  // the `i` flag every one of these read as absent, so a spec-valid
  // <meta name="Description"> produced a false "no meta description" warning.
  test("meta[name] is read case-insensitively, as the HTML spec requires", () => {
    const html = `
      <html>
        <head>
          <title>Mixed-case metadata</title>
          <meta name="Description" content="Capital D description." />
          <meta name="ROBOTS" content="noindex" />
          <meta name="Author" content="Ada Lovelace" />
          <meta name="datePublished" content="2026-04-01" />
        </head>
        <body><main><p>Body text.</p></main></body>
      </html>`;

    const parsed = parseHtmlPage(html, "https://example.dev/mixed-case");

    expect(parsed.metaDescription).toBe("Capital D description.");
    expect(parsed.robotsMeta).toBe("noindex");
    expect(parsed.authorSignals.metaAuthor).toBe("Ada Lovelace");
    expect(parsed.publishedDate).toBe("2026-04-01");
  });
});
