import { describe, expect, test } from "vitest";
import { sitemapHygieneRule } from "../../../src/rules/tech/sitemap-hygiene.js";

const SOURCE = "https://example.com/";
const NOW = new Date("2026-08-19T12:00:00Z");

function urls(...items: string[]): ReadonlySet<string> {
  return new Set(items);
}

describe("sitemapHygieneRule", () => {
  test("returns empty when sitemapUrls is empty", () => {
    const findings = sitemapHygieneRule(new Set(), new Map(), SOURCE, NOW);
    expect(findings).toHaveLength(0);
  });

  test("clean same-host sitemap with good lastmods returns no findings", () => {
    const set = urls("https://example.com/a", "https://example.com/b");
    const lastmods = new Map([
      ["https://example.com/a", "2026-01-15"],
      ["https://example.com/b", "2025-12-01T09:30:00Z"],
    ]);
    const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
    expect(findings).toHaveLength(0);
  });

  describe("cross-host URLs", () => {
    test("15 foreign URLs produce ONE rollup error with relatedUrls capped at 10 and count in message", () => {
      const foreign = Array.from({ length: 15 }, (_, i) => `https://other.net/page-${i}`);
      const set = urls("https://example.com/home", ...foreign);
      const findings = sitemapHygieneRule(set, undefined, SOURCE, NOW);

      const crossHost = findings.filter((f) => f.message.includes("different host"));
      expect(crossHost).toHaveLength(1);
      expect(crossHost[0].severity).toBe("error");
      expect(crossHost[0].confidence).toBe("high");
      expect(crossHost[0].ruleId).toBe("tech/sitemap-hygiene");
      expect(crossHost[0].relatedUrls).toHaveLength(10);
      expect(crossHost[0].message).toContain("15");
      // Fix must mention the Google cross-host exception
      expect(crossHost[0].fix).toContain("Search Console");
      expect(crossHost[0].fix).toContain("robots.txt");
    });

    test("www-equivalence does NOT fire (www.example.com vs example.com)", () => {
      const set = urls("https://www.example.com/a", "https://example.com/b");
      const findings = sitemapHygieneRule(set, undefined, "https://example.com/", NOW);
      expect(findings.every((f) => !f.message.includes("different host"))).toBe(true);
    });

    test("www on the source side is also equivalent", () => {
      const set = urls("https://example.com/a");
      const findings = sitemapHygieneRule(set, undefined, "https://www.example.com/", NOW);
      expect(findings).toHaveLength(0);
    });

    test("host comparison is case-insensitive", () => {
      const set = urls("https://EXAMPLE.COM/a");
      const findings = sitemapHygieneRule(set, undefined, SOURCE, NOW);
      expect(findings).toHaveLength(0);
    });

    test("genuinely different subdomain fires", () => {
      const set = urls("https://blog.example.com/a");
      const findings = sitemapHygieneRule(set, undefined, SOURCE, NOW);
      const crossHost = findings.filter((f) => f.message.includes("different host"));
      expect(crossHost).toHaveLength(1);
      expect(crossHost[0].relatedUrls).toEqual(["https://blog.example.com/a"]);
    });
  });

  describe("unparseable URLs", () => {
    test("entries new URL() rejects produce one rollup warning", () => {
      const set = urls("https://example.com/ok", "/relative/path", "not a url at all");
      const findings = sitemapHygieneRule(set, undefined, SOURCE, NOW);
      const bad = findings.filter((f) => f.message.includes("not valid URLs"));
      expect(bad).toHaveLength(1);
      expect(bad[0].severity).toBe("warning");
      expect(bad[0].message).toContain("2");
      expect(bad[0].relatedUrls).toContain("/relative/path");
      expect(bad[0].relatedUrls).toContain("not a url at all");
    });
  });

  describe("lastmod: future dates", () => {
    test("lastmod more than 24h in the future fires with injected now", () => {
      const set = urls("https://example.com/a", "https://example.com/b");
      const lastmods = new Map([
        ["https://example.com/a", "2026-08-25T00:00:00Z"], // ~6 days ahead of NOW
        ["https://example.com/b", "2026-08-01"],
      ]);
      const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
      const future = findings.filter((f) => f.message.includes("future"));
      expect(future).toHaveLength(1);
      expect(future[0].severity).toBe("warning");
      expect(future[0].confidence).toBe("high");
      expect(future[0].message).toContain("1");
      expect(future[0].relatedUrls).toEqual(["https://example.com/a"]);
    });

    test("lastmod within the 24h tolerance does NOT fire", () => {
      const set = urls("https://example.com/a");
      // 12h ahead of NOW — inside the tolerance window
      const lastmods = new Map([["https://example.com/a", "2026-08-20T00:00:00Z"]]);
      const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
      expect(findings.every((f) => !f.message.includes("future"))).toBe(true);
    });
  });

  describe("lastmod: unparseable", () => {
    test("plain date 2026-01-15 parses fine (no finding)", () => {
      const set = urls("https://example.com/a");
      const lastmods = new Map([["https://example.com/a", "2026-01-15"]]);
      const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
      expect(findings).toHaveLength(0);
    });

    test('"yesterday" fires the unparseable-lastmod warning', () => {
      const set = urls("https://example.com/a", "https://example.com/b");
      const lastmods = new Map([
        ["https://example.com/a", "yesterday"],
        ["https://example.com/b", "2026-01-15"],
      ]);
      const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
      const bad = findings.filter((f) => f.message.includes("not a valid W3C datetime"));
      expect(bad).toHaveLength(1);
      expect(bad[0].severity).toBe("warning");
      expect(bad[0].relatedUrls).toEqual(["https://example.com/a"]);
    });

    test("grossly wrong format (e.g. 15/01/2026) fires even if Date.parse might accept it", () => {
      const set = urls("https://example.com/a");
      const lastmods = new Map([["https://example.com/a", "15/01/2026"]]);
      const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
      expect(findings.some((f) => f.message.includes("not a valid W3C datetime"))).toBe(true);
    });
  });

  describe("lastmod: generated/fake", () => {
    function bulk(count: number, lastmodFor: (i: number) => string) {
      const set = new Set<string>();
      const lastmods = new Map<string, string>();
      for (let i = 0; i < count; i += 1) {
        const url = `https://example.com/page-${i}`;
        set.add(url);
        lastmods.set(url, lastmodFor(i));
      }
      return { set, lastmods };
    }

    test("100 URLs with 99 identical lastmods fires generated-lastmod at medium confidence", () => {
      const { set, lastmods } = bulk(100, (i) => (i === 0 ? "2026-01-01" : "2026-06-01"));
      const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
      const generated = findings.filter((f) => f.message.includes("exact same <lastmod>"));
      expect(generated).toHaveLength(1);
      expect(generated[0].severity).toBe("warning");
      expect(generated[0].confidence).toBe("medium");
      expect(generated[0].message).toContain("99");
      expect(generated[0].message).toContain("100");
      expect(generated[0].message).toContain("2026-06-01");
    });

    test("50 URLs never fires generated-lastmod even when all identical", () => {
      const { set, lastmods } = bulk(50, () => "2026-06-01");
      const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
      expect(findings.every((f) => !f.message.includes("exact same <lastmod>"))).toBe(true);
    });

    test("100 URLs with diverse lastmods does not fire (below 95% share)", () => {
      const { set, lastmods } = bulk(100, (i) => (i < 90 ? "2026-06-01" : `2026-05-${String((i % 28) + 1).padStart(2, "0")}`));
      const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
      expect(findings.every((f) => !f.message.includes("exact same <lastmod>"))).toBe(true);
    });
  });

  test("undefined lastmodByUrl skips all lastmod checks without throwing", () => {
    const set = urls("https://example.com/a");
    const findings = sitemapHygieneRule(set, undefined, SOURCE, NOW);
    expect(findings).toHaveLength(0);
  });

  test("multiple issue kinds each produce exactly one rollup finding", () => {
    const set = urls(
      "https://other.net/x",
      "https://other.net/y",
      "garbage-entry",
      "https://example.com/future",
      "https://example.com/bad-lastmod",
    );
    const lastmods = new Map([
      ["https://example.com/future", "2027-01-01"],
      ["https://example.com/bad-lastmod", "last tuesday"],
    ]);
    const findings = sitemapHygieneRule(set, lastmods, SOURCE, NOW);
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.ruleId === "tech/sitemap-hygiene")).toBe(true);
  });
});
