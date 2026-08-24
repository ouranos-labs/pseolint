import { describe, expect, test } from "vitest";
import { crawlableAnchorsRule } from "../../../src/rules/links/crawlable-anchors.js";
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

describe("crawlableAnchorsRule", () => {
  test("clean page with real hrefs → no findings", () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<nav>
          <a href="/pricing">Pricing</a>
          <a href="/docs">Docs</a>
          <a href="https://ex.com/blog">Blog</a>
          <a href="https://other.com/partner">Partner</a>
          <a href="/contact">Contact</a>
        </nav>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("3 href-less nav anchors with click handlers → warning with counts and confidence high", () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<nav>
          <a class="nav-item" onclick="go('/home')">Home</a>
          <a class="nav-item" onclick="go('/products')">Products</a>
          <a class="nav-item" onclick="go('/about')">About us</a>
          <a href="/contact">Contact</a>
        </nav>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("links/crawlable-anchors");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("high");
    expect(findings[0].message).toContain("3 of 4");
    expect(findings[0].pageUrl).toBe("https://ex.com/a");
  });

  test("javascript: hrefs count as non-crawlable (case-insensitive)", () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a href="javascript:void(0)">Open menu</a>
         <a href="JavaScript:showModal()">Sign up</a>
         <a href=" javascript:next() ">Next</a>
         <a href="/real">Real link</a>
         <a href="/real2">Another real link</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("3 of 5");
  });

  test('href="#" with onclick fires', () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a href="#" onclick="nav('/x')">Products</a>
         <a href="#" onclick="nav('/y')">Solutions</a>
         <a href="#" onclick="nav('/z')">Company</a>
         <a href="/contact">Contact</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("3 of 4");
  });

  test('href="#section" fragment links alone do NOT fire', () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a href="#features">Features</a>
         <a href="#pricing">Pricing</a>
         <a href="#faq">FAQ</a>
         <a href="/docs">Docs</a>
         <a href="/blog">Blog</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test('bare href="#" without onclick or router attribute does not count', () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a href="#">Top</a>
         <a href="#">Top again</a>
         <a href="#">Top once more</a>
         <a href="/docs">Docs</a>
         <a href="/blog">Blog</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("router-attribute anchors without href count as non-crawlable", () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a routerlink="/dashboard">Dashboard</a>
         <a data-router-link="/settings">Settings</a>
         <a href="#" v-on:click="go('/reports')">Reports</a>
         <a href="/help">Help</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("3 of 4");
  });

  test("ERROR escalation: 5+ fake anchors and fewer than 2 real internal links", () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a href="javascript:go('/a')">Products</a>
         <a href="javascript:go('/b')">Solutions</a>
         <a href="javascript:go('/c')">Pricing</a>
         <a href="#" onclick="go('/d')">Company</a>
         <a onclick="go('/e')">Careers</a>
         <a href="https://twitter.com/ex">Twitter</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("5 of 6");
  });

  test("stays warning with 5+ fake anchors when 2+ real internal links exist", () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a href="javascript:go('/a')">Products</a>
         <a href="javascript:go('/b')">Solutions</a>
         <a href="javascript:go('/c')">Pricing</a>
         <a href="javascript:go('/d')">Company</a>
         <a href="javascript:go('/e')">Careers</a>
         <a href="/docs">Docs</a>
         <a href="https://ex.com/blog">Blog</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });

  test("<button> elements are ignored even with onclick", () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<button onclick="openModal()">Sign up</button>
         <button onclick="nav('/x')">Products</button>
         <button onclick="nav('/y')">Solutions</button>
         <button onclick="nav('/z')">Company</button>
         <a href="/docs">Docs</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("mailto: and tel: links are not counted as non-crawlable", () => {
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a href="mailto:hi@ex.com">Email us</a>
         <a href="tel:+15550100">Call us</a>
         <a href="mailto:sales@ex.com">Sales</a>
         <a href="/docs">Docs</a>
         <a href="/blog">Blog</a>`
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("page with empty html is skipped", () => {
    const findings = crawlableAnchorsRule([page("https://ex.com/a", "")]);
    expect(findings).toEqual([]);
  });

  test("ratio edge: 1 fake of 20 anchors → no finding", () => {
    const real = Array.from({ length: 19 }, (_, i) => `<a href="/p/${i}">Page ${i}</a>`).join("\n");
    const findings = crawlableAnchorsRule([
      page("https://ex.com/a", `${real}\n<a href="javascript:void(0)">Menu</a>`),
    ]);
    expect(findings).toEqual([]);
  });

  test("ratio branch: 2 fake of 8 anchors (25%) fires warning even below the count-of-3 floor", () => {
    const real = Array.from({ length: 6 }, (_, i) => `<a href="/p/${i}">Page ${i}</a>`).join("\n");
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `${real}\n<a href="javascript:void(0)">Menu</a>\n<a href="">Empty</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("2 of 8");
  });

  test("message includes up to 3 quoted example anchor texts, capped at 40 chars", () => {
    const longText = "This is an extremely long anchor label that keeps going and going";
    const findings = crawlableAnchorsRule([
      page(
        "https://ex.com/a",
        `<a onclick="go(0)">${longText}</a>
         <a onclick="go(1)">Products</a>
         <a onclick="go(2)">Solutions</a>
         <a onclick="go(3)">Company</a>`
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('"Products"');
    expect(findings[0].message).toContain(`"${longText.slice(0, 40)}…"`);
    // Only 3 samples even though 4 anchors are non-crawlable.
    expect(findings[0].message).not.toContain('"Company"');
  });

  test("one finding per page across multiple pages", () => {
    const bad = `<a onclick="go(1)">One</a><a onclick="go(2)">Two</a><a onclick="go(3)">Three</a>`;
    const findings = crawlableAnchorsRule([
      page("https://ex.com/a", bad),
      page("https://ex.com/b", `<a href="/x">X</a>`),
      page("https://ex.com/c", bad),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.pageUrl)).toEqual(["https://ex.com/a", "https://ex.com/c"]);
  });
  // Lighthouse's crawlable-anchors audit, which this rule's docstring cites as
  // "the same check", excludes these outright. Counting them reported
  // "5 of 8 <a> elements are not crawlable" on a ToS page whose navigation was
  // fine: heading anchors, footnote back-references and role-annotated icon
  // controls are ordinary, correct markup.
  describe("Lighthouse exclusions", () => {
    test('<a id="..."> jump targets are not counted (if (rawHref === "" && id) return)', () => {
      const findings = crawlableAnchorsRule([
        page(
          "https://ex.com/tos",
          `<h2><a id="section-1"></a>Acceptable use</h2>
           <h2><a id="section-2"></a>Termination</h2>
           <h2><a id="section-3"></a>Liability</h2>
           <h2><a id="section-4"></a>Governing law</h2>
           <h2><a id="section-5"></a>Contact</h2>
           <a href="/legal">Legal</a>
           <a href="/privacy">Privacy</a>
           <a href="/terms">Terms</a>`
        ),
      ]);
      expect(findings).toEqual([]);
    });

    test('<a name="..."> legacy jump targets are not counted (if (name.length > 0) return)', () => {
      const findings = crawlableAnchorsRule([
        page(
          "https://ex.com/tos",
          `<a name="fn1"></a><a name="fn2"></a><a name="fn3"></a>
           <a href="/legal">Legal</a>
           <a href="/privacy">Privacy</a>`
        ),
      ]);
      expect(findings).toEqual([]);
    });

    test("role-annotated anchors are not counted (if (role.length > 0) return)", () => {
      const findings = crawlableAnchorsRule([
        page(
          "https://ex.com/a",
          `<a role="button" onclick="openMenu()">Menu</a>
           <a role="button" onclick="openSearch()">Search</a>
           <a role="tab" href="#panel-1">Overview</a>
           <a href="/docs">Docs</a>
           <a href="/blog">Blog</a>`
        ),
      ]);
      expect(findings).toEqual([]);
    });

    test("a bare href-less anchor is a spec placeholder, not an uncrawlable link", () => {
      // Per the HTML spec an <a> with no href "represents a placeholder for
      // where a link might otherwise have been placed". Lighthouse fails it
      // only when it has a listener, which static HTML cannot observe.
      const findings = crawlableAnchorsRule([
        page(
          "https://ex.com/a",
          `<a class="disabled">Coming soon</a>
           <a class="disabled">Also coming soon</a>
           <a class="disabled">Still coming soon</a>
           <a href="/docs">Docs</a>
           <a href="/blog">Blog</a>`
        ),
      ]);
      expect(findings).toEqual([]);
    });

    test("an href-less anchor carrying an href-associated attribute still counts", () => {
      // target/rel/download "must be omitted if the href attribute is not
      // present", so their presence means a link was meant and the href is
      // missing, which is a real crawl loss rather than a placeholder.
      const findings = crawlableAnchorsRule([
        page(
          "https://ex.com/a",
          `<a target="_blank">Report</a>
           <a rel="noopener">Dashboard</a>
           <a download>Invoice</a>
           <a href="/docs">Docs</a>`
        ),
      ]);
      expect(findings).toHaveLength(1);
      expect(findings[0].message).toContain("3 of 4");
    });
  });
});
