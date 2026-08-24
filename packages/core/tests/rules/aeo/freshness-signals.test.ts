import { describe, expect, test } from "vitest";
import { freshnessSignalsRule } from "../../../src/rules/aeo/freshness-signals.js";
import { page } from "./page-fixture.js";

const now = () => new Date("2026-04-21T00:00:00Z").getTime();

describe("aeo/freshness-signals", () => {
  test("warns on pages with no freshness signal anywhere", () => {
    const p = page("https://example.dev/a", { html: "<html><body>hello</body></html>" });
    const findings = freshnessSignalsRule([p], { now });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toMatch(/no dateModified/);
    // Missing dateModified → medium (could be intentional on evergreen pages).
    expect(findings[0].confidence).toBe("medium");
  });

  test("accepts JSON-LD dateModified and does not warn", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ "@type": "Article", dateModified: "2026-04-01" }],
      html: "<html><body>hello</body></html>",
    });
    expect(freshnessSignalsRule([p], { now })).toHaveLength(0);
  });

  test("accepts meta article:modified_time and does not warn", () => {
    const p = page("https://example.dev/a", {
      html: '<html><head><meta property="article:modified_time" content="2026-04-01"></head><body>hi</body></html>',
    });
    expect(freshnessSignalsRule([p], { now })).toHaveLength(0);
  });

  test("accepts visible 'Last updated' text", () => {
    const p = page("https://example.dev/a", {
      html: "<html><body>Last updated: March 2026</body></html>",
      contentText: "Last updated: March 2026",
    });
    expect(freshnessSignalsRule([p], { now })).toHaveLength(0);
  });

  test("emits info when dateModified exists but is older than maxStaleDays", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ "@type": "Article", dateModified: "2024-01-01" }],
      html: "<html><body>hi</body></html>",
    });
    const findings = freshnessSignalsRule([p], { now, maxStaleDays: 180 });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].message).toMatch(/days ago/);
    // Stale-but-present dateModified → low (some pages are evergreen by design).
    expect(findings[0].confidence).toBe("low");
  });

  test("respects custom maxStaleDays", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ "@type": "Article", dateModified: "2025-11-01" }],
      html: "<html><body>hi</body></html>",
    });
    // ~172 days ago at now=2026-04-21: under the large threshold, over the small one.
    expect(freshnessSignalsRule([p], { now, maxStaleDays: 200 })).toHaveLength(0);
    expect(freshnessSignalsRule([p], { now, maxStaleDays: 30 })).toHaveLength(1);
  });

  test("recursively discovers dateModified in nested JSON-LD", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{
        "@graph": [{ "@type": "Article", dateModified: "2026-03-01" }],
      }],
      html: "<html><body>hi</body></html>",
    });
    expect(freshnessSignalsRule([p], { now })).toHaveLength(0);
  });

  test("datePublished ALONE does not count as a modification signal", () => {
    const p = page("https://example.dev/a", {
      // Published in 2019 and never re-edited: has a date signal, but not modification.
      jsonLd: [{ "@type": "Article", datePublished: "2019-06-01" }],
      html: "<html><body>hello</body></html>",
    });
    const findings = freshnessSignalsRule([p], { now });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toMatch(/no dateModified/);
  });

  test("accepts meta tag when attributes are in reverse order", () => {
    const p = page("https://example.dev/a", {
      html: '<html><head><meta content="2026-04-01" property="article:modified_time"></head><body>hi</body></html>',
    });
    expect(freshnessSignalsRule([p], { now })).toHaveLength(0);
  });

  test("malformed date string falls through without crashing", () => {
    const p = page("https://example.dev/a", {
      jsonLd: [{ "@type": "Article", dateModified: "recently updated" }],
      html: "<html><body>hi</body></html>",
    });
    // Has a modification signal (even if unparseable), so no warning fires.
    // And no info fires because `best` is null → no staleness math attempted.
    expect(freshnessSignalsRule([p], { now })).toHaveLength(0);
  });
});
