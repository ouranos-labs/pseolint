import { describe, expect, test } from "vitest";
import { hostSectionDivergenceRule } from "../../../src/rules/links/host-section-divergence.js";
import { categoryForRule } from "../../../src/auditor.js";
import type { ParsedPage } from "../../../src/types.js";

interface PageOpts {
  contentText?: string;
  structureSignature?: string;
  resolvedHrefs?: string[];
  withAuthor?: boolean;
}

function page(url: string, opts: PageOpts = {}): ParsedPage {
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
    authorSignals: opts.withAuthor
      ? { metaAuthor: "Jane Doe", schemaAuthor: true, bylineElement: true, relAuthorLink: false }
      : { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: opts.resolvedHrefs ?? [],
    structureSignature: opts.structureSignature ?? "default-sig",
    contentText: opts.contentText ?? "default content body words ".repeat(20),
    html: "<html></html>",
  };
}

function adjacencyFromPages(pages: ParsedPage[]): Map<string, Set<string>> {
  const known = new Set(pages.map((p) => p.url));
  const adj = new Map<string, Set<string>>();
  for (const p of pages) {
    adj.set(p.url, new Set(p.resolvedHrefs.filter((h) => known.has(h))));
  }
  return adj;
}

const NEWS_TEXT = "election senate congress mayor city council policy debate vote ".repeat(8);
const COUPON_TEXT = "discount coupon promo code save deal off voucher promotion ".repeat(8);

describe("hostSectionDivergenceRule", () => {
  test("returns empty when no section reaches the 10-page minimum", () => {
    const pages = [
      page("https://ex.com/a/1"),
      page("https://ex.com/a/2"),
      page("https://ex.com/b/1"),
    ];
    expect(hostSectionDivergenceRule(pages, adjacencyFromPages(pages))).toEqual([]);
  });

  test("returns empty when corpus is too small overall", () => {
    const pages = Array.from({ length: 8 }, (_, i) =>
      page(`https://ex.com/news/${i}`, { contentText: NEWS_TEXT }),
    );
    expect(hostSectionDivergenceRule(pages, adjacencyFromPages(pages))).toEqual([]);
  });

  test("does not fire when a section diverges on only one signal", () => {
    // 12-page /coupons section topic-diverges, but is well-cross-linked from
    // news (inboundExternalRatio high), shares templates, and shares author
    // coverage. Only 1 signal trips → no finding.
    const news = Array.from({ length: 15 }, (_, i) =>
      page(`https://ex.com/news/${i}`, {
        contentText: NEWS_TEXT,
        structureSignature: "shared-sig",
        withAuthor: true,
        resolvedHrefs: [`https://ex.com/coupons/${i % 12}`], // every news page links to a coupon
      }),
    );
    const coupons = Array.from({ length: 12 }, (_, i) =>
      page(`https://ex.com/coupons/${i}`, {
        contentText: COUPON_TEXT,
        structureSignature: "shared-sig",
        withAuthor: true,
      }),
    );
    const findings = hostSectionDivergenceRule([...news, ...coupons], adjacencyFromPages([...news, ...coupons]));
    expect(findings).toEqual([]);
  });

  test("fires warning when 2 signals stack (rented-inventory shape)", () => {
    // 12-page /coupons section that:
    //   - has zero inbound links from /news (inboundExternalRatio = 0)
    //   - uses a different template (templateOverlap = 0)
    // News pages have authors and shared template; coupons have neither.
    const news = Array.from({ length: 15 }, (_, i) =>
      page(`https://ex.com/news/${i}`, {
        contentText: NEWS_TEXT,
        structureSignature: "news-sig",
        withAuthor: true,
        resolvedHrefs: i > 0 ? [`https://ex.com/news/${i - 1}`] : [],
      }),
    );
    const coupons = Array.from({ length: 12 }, (_, i) =>
      page(`https://ex.com/coupons/${i}`, {
        contentText: COUPON_TEXT,
        structureSignature: "coupons-sig",
        withAuthor: false,
        resolvedHrefs: i > 0 ? [`https://ex.com/coupons/${i - 1}`] : [],
      }),
    );
    const all = [...news, ...coupons];
    const findings = hostSectionDivergenceRule(all, adjacencyFromPages(all));
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("links/host-section-divergence");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("/coupons/");
    expect(findings[0].message).toContain("12 pages");
  });

  test("escalates to error when 3+ signals stack on a >50-page section", () => {
    // Large news host with a 51-page /coupons parasite section that trips
    // inboundExternalRatio + templateOverlap + topic + authorship. Section is
    // a minority of the corpus (51 < 200/2) and >50 pages → severity escalates.
    const news = Array.from({ length: 200 }, (_, i) =>
      page(`https://ex.com/news/${i}`, {
        contentText: NEWS_TEXT,
        structureSignature: "news-sig",
        withAuthor: true,
        resolvedHrefs: i > 0 ? [`https://ex.com/news/${i - 1}`] : [],
      }),
    );
    const coupons = Array.from({ length: 51 }, (_, i) =>
      page(`https://ex.com/coupons/${i}`, {
        contentText: COUPON_TEXT,
        structureSignature: "coupons-sig",
        withAuthor: false,
        resolvedHrefs: i > 0 ? [`https://ex.com/coupons/${i - 1}`] : [],
      }),
    );
    const all = [...news, ...coupons];
    const findings = hostSectionDivergenceRule(all, adjacencyFromPages(all));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("/coupons/");
  });

  test("does not fire on an integrated host (uniform topic + template + cross-linking)", () => {
    // Three integrated sections sharing template, topic, authorship, and
    // cross-links. /blog (12 pages) is a minority candidate but no signals
    // trip — the host is consistent.
    const news = Array.from({ length: 30 }, (_, i) =>
      page(`https://ex.com/news/${i}`, {
        contentText: NEWS_TEXT,
        structureSignature: "uniform-sig",
        withAuthor: true,
        resolvedHrefs: [`https://ex.com/blog/${i % 12}`],
      }),
    );
    const blog = Array.from({ length: 12 }, (_, i) =>
      page(`https://ex.com/blog/${i}`, {
        contentText: NEWS_TEXT,
        structureSignature: "uniform-sig",
        withAuthor: true,
        resolvedHrefs: [`https://ex.com/news/${i}`],
      }),
    );
    const all = [...news, ...blog];
    expect(hostSectionDivergenceRule(all, adjacencyFromPages(all))).toEqual([]);
  });

  test("includes up to 20 sample URLs in relatedUrls", () => {
    // 50-page news host with a 25-page /coupons parasite (25 < 75/2) so the
    // section is a minority. Sample list capped at 20.
    const news = Array.from({ length: 50 }, (_, i) =>
      page(`https://ex.com/news/${i}`, {
        contentText: NEWS_TEXT,
        structureSignature: "news-sig",
        withAuthor: true,
      }),
    );
    const coupons = Array.from({ length: 25 }, (_, i) =>
      page(`https://ex.com/coupons/${i}`, {
        contentText: COUPON_TEXT,
        structureSignature: "coupons-sig",
        withAuthor: false,
      }),
    );
    const all = [...news, ...coupons];
    const findings = hostSectionDivergenceRule(all, adjacencyFromPages(all));
    expect(findings).toHaveLength(1);
    expect(findings[0].relatedUrls?.length).toBeLessThanOrEqual(20);
    expect(findings[0].relatedUrls?.length).toBeGreaterThan(0);
    for (const url of findings[0].relatedUrls!) {
      expect(url).toContain("/coupons/");
    }
  });
});

describe("host-section-divergence scoring category", () => {
  // Site-reputation-abuse is a spam-policy (INTEGRITY) signal even though the
  // rule lives in the links namespace because it reads the link graph. It must
  // score in the integrity bucket, not discoverability — otherwise a confirmed
  // parasite section barely moves the risk score on a programmatic-directory
  // (discoverability weight 0.15 vs integrity 0.55). See RULE_CATEGORY_OVERRIDES.
  test("routes to the integrity bucket, not discoverability", () => {
    expect(categoryForRule("links/host-section-divergence")).toBe("integrity");
  });

  test("sibling links rules stay in discoverability", () => {
    expect(categoryForRule("links/orphan-pages")).toBe("discoverability");
    expect(categoryForRule("links/dead-ends")).toBe("discoverability");
  });
});
