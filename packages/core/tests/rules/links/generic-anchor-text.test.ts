import { describe, expect, test } from "vitest";
import { genericAnchorTextRule } from "../../../src/rules/links/generic-anchor-text.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, html: string): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText: "",
    html,
  };
}

describe("genericAnchorTextRule", () => {
  test("5 internal links all 'Read more' → info with confidence medium", () => {
    const links = Array.from(
      { length: 5 },
      (_, i) => `<a href="/post/${i}">Read more</a>`
    ).join("\n");
    const findings = genericAnchorTextRule([page("https://ex.com/blog", links)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("links/generic-anchor-text");
    expect(findings[0].severity).toBe("info");
    expect(findings[0].confidence).toBe("medium");
    expect(findings[0].message).toContain("5 of 5");
    expect(findings[0].message).toContain('"Read more"');
    expect(findings[0].pageUrl).toBe("https://ex.com/blog");
  });

  test("mixed: 2 generic of 6 internal → no finding (below 50% ratio)", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/pricing">Compare pricing plans</a>
         <a href="/docs/install">Installation guide</a>
         <a href="/blog/launch">Launch announcement</a>
         <a href="/security">Security whitepaper</a>
         <a href="/post/1">Read more</a>
         <a href="/post/2">Click here</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("external links are excluded from the denominator", () => {
    // 5 internal generic links fire even though 5 descriptive external links exist.
    const internal = Array.from(
      { length: 5 },
      (_, i) => `<a href="https://ex.com/post/${i}">Learn more</a>`
    ).join("\n");
    const external = Array.from(
      { length: 5 },
      (_, i) => `<a href="https://other.com/ref/${i}">Detailed reference ${i}</a>`
    ).join("\n");
    const findings = genericAnchorTextRule([page("https://ex.com/a", internal + external)]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("5 of 5");
  });

  test("external generic links alone do not fire (internal count below 5)", () => {
    const external = Array.from(
      { length: 8 },
      (_, i) => `<a href="https://other.com/${i}">Click here</a>`
    ).join("\n");
    const findings = genericAnchorTextRule([
      page("https://ex.com/a", `${external}\n<a href="/docs">API documentation</a>`),
    ]);
    expect(findings).toEqual([]);
  });

  test("image link with descriptive alt is not generic", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/p/1"><img src="/1.png" alt="Blue widget product photo"></a>
         <a href="/p/2"><img src="/2.png" alt="Red widget product photo"></a>
         <a href="/p/3"><img src="/3.png" alt="Green widget product photo"></a>
         <a href="/p/4">Read more</a>
         <a href="/p/5">Read more</a>`
      ),
    ]);
    // 2 generic of 5 internal = 40% < 50%; the descriptive alts keep it clean.
    expect(findings).toEqual([]);
  });

  test("empty-text anchors count as generic", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/p/1"></a>
         <a href="/p/2"><span></span></a>
         <a href="/p/3"><img src="/3.png"></a>
         <a href="/p/4">Widget comparison table</a>
         <a href="/p/5">Widget buying guide</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("3 of 5");
  });

  test("fewer than 5 internal links → no finding even when all are generic", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/p/1">Click here</a>
         <a href="/p/2">Read more</a>
         <a href="/p/3">More</a>
         <a href="/p/4">Here</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("clean page with descriptive internal anchors → no findings", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/pricing">Pricing plans</a>
         <a href="/docs">Developer documentation</a>
         <a href="/blog">Engineering blog</a>
         <a href="/about">About the team</a>
         <a href="/careers">Open roles</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("matching is case-insensitive and strips trailing punctuation", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/p/1">READ MORE</a>
         <a href="/p/2">Learn more!</a>
         <a href="/p/3">Continue reading →</a>
         <a href="/p/4">Click here...</a>
         <a href="/p/5">More info:</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("5 of 5");
  });

  test("relative hrefs are treated as internal", () => {
    const links = Array.from({ length: 5 }, (_, i) => `<a href="post-${i}.html">More</a>`).join(
      "\n"
    );
    const findings = genericAnchorTextRule([page("https://ex.com/blog/index.html", links)]);
    expect(findings).toHaveLength(1);
  });

  test("page with empty html is skipped", () => {
    const findings = genericAnchorTextRule([page("https://ex.com/a", "")]);
    expect(findings).toEqual([]);
  });

  test("page with unparseable url is skipped", () => {
    const links = Array.from({ length: 5 }, (_, i) => `<a href="/p/${i}">More</a>`).join("\n");
    const findings = genericAnchorTextRule([page("not a url", links)]);
    expect(findings).toEqual([]);
  });

  test("message includes ratio percentage and caps samples at 3", () => {
    const links = Array.from({ length: 6 }, (_, i) => `<a href="/p/${i}">Read more</a>`).join("\n");
    const findings = genericAnchorTextRule([
      page("https://ex.com/a", `${links}\n<a href="/docs">Full API reference</a>`),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("6 of 7");
    expect(findings[0].message).toContain("86%");
    const quoted = findings[0].message.match(/"Read more"/g) ?? [];
    expect(quoted.length).toBe(3);
  });
  // An anchor's accessible name is what a browser (and Google) reads. Ignoring
  // aria-label/title reported a correctly labelled icon header as
  // "3 of 6 internal links (50%) use generic anchor text (e.g. "" (empty), ...)".
  test("aria-label supplies the accessible name for icon-only links", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/search" aria-label="Search products"><svg aria-hidden="true"></svg></a>
         <a href="/cart" aria-label="Shopping cart"><svg aria-hidden="true"></svg></a>
         <a href="/account" aria-label="Your account"><svg aria-hidden="true"></svg></a>
         <a href="/pricing">Pricing plans</a>
         <a href="/docs">Developer docs</a>
         <a href="/blog">Engineering blog</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("title is the next fallback after aria-label", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/rss" title="Subscribe by RSS"><svg></svg></a>
         <a href="/x" title="Follow on X"><svg></svg></a>
         <a href="/gh" title="Source on GitHub"><svg></svg></a>
         <a href="/pricing">Pricing plans</a>
         <a href="/docs">Developer docs</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("an anchor with no name at all is still generic", () => {
    const findings = genericAnchorTextRule([
      page(
        "https://ex.com/a",
        `<a href="/one"><svg aria-hidden="true"></svg></a>
         <a href="/two"><svg aria-hidden="true"></svg></a>
         <a href="/three"><svg aria-hidden="true"></svg></a>
         <a href="/pricing">Pricing plans</a>
         <a href="/docs">Developer docs</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("3 of 5");
  });
});
