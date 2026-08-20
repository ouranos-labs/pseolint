import { describe, expect, test } from "vitest";
import { eeatSignalsRule } from "../../../src/rules/content/eeat-signals.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: "", ...overrides
  };
}

describe("eeatSignalsRule", () => {
  test("flags page with zero signals", () => {
    const findings = eeatSignalsRule([page("https://example.com/bare")]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("content/eeat-signals");
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toContain("E-E-A-T");
  });

  test("flags page with only 1 signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/one", { publishedDate: "2024-01-01" })
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain("E-E-A-T");
  });

  test("passes page with 2 signals (author + about link)", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/good", {
        authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
        resolvedHrefs: ["https://example.com/about"]
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts about page link signal from resolvedHrefs", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/p", {
        resolvedHrefs: ["https://example.com/about-us"],
        publishedDate: "2024-06-01"
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts last-updated contentText pattern as a signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/q", {
        contentText: "Last Updated: March 2024",
        publishedDate: "2024-03-01"
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts reviewed-by contentText pattern as a signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/r", {
        contentText: "Reviewed by Dr. Smith",
        authorSignals: { metaAuthor: "Author", schemaAuthor: false, bylineElement: false, relAuthorLink: false }
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts sources: contentText pattern as a signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/s", {
        contentText: "Sources: CDC, WHO",
        publishedDate: "2024-01-01"
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("counts references: contentText pattern as a signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/t", {
        contentText: "References:",
        resolvedHrefs: ["https://example.com/about"]
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  test("does not count about link when href has no /about path", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/u", {
        resolvedHrefs: ["https://example.com/contact"]
      })
    ]);
    expect(findings).toHaveLength(1);
  });

  test("passes page with all 4 signal categories", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/full", {
        authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
        resolvedHrefs: ["https://example.com/about"],
        publishedDate: "2024-01-01",
        contentText: "Last modified: Jan 2024 Sources:"
      })
    ]);
    expect(findings).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // NEW: scope signals to content, not raw HTML
  // -------------------------------------------------------------------------

  test("'last updated' only in footer/JS raw HTML (not contentText): does NOT count as signal", () => {
    // The raw HTML has "last updated" in a JS var and footer, but contentText is empty.
    // After the fix (check contentText not html), this should NOT get the pattern credit.
    const findings = eeatSignalsRule([
      page("https://example.com/footer-only", {
        html: '<script>var lastUpdated = "2024-01-01";</script><footer>Last modified: Jan 2024</footer>',
        contentText: "",  // no main content text
        publishedDate: "2024-03-01"  // provides 1 signal (publishedDate)
      })
    ]);
    // Only publishedDate counts => 1 signal < 2 => should flag
    expect(findings).toHaveLength(1);
  });

  test("outbound /about link to a different host does NOT count as the page's own about link", () => {
    // An outbound link to https://otherdomain.com/about should NOT trigger the about-page signal
    // for a page on https://example.com/. Only same-host /about links count.
    const findings = eeatSignalsRule([
      page("https://example.com/page", {
        resolvedHrefs: ["https://otherdomain.com/about"],
        publishedDate: "2024-01-01"
      })
    ]);
    // Only publishedDate counts => 1 signal < 2 => should flag
    expect(findings).toHaveLength(1);
  });

  test("same-host /about link counts as about-page signal", () => {
    const findings = eeatSignalsRule([
      page("https://example.com/page", {
        resolvedHrefs: ["https://example.com/about"],
        publishedDate: "2024-01-01"
      })
    ]);
    // 2 signals (about + publishedDate) => passes
    expect(findings).toHaveLength(0);
  });
});
