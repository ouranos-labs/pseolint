import { describe, expect, test } from "vitest";
import { clusterConnectivityRule } from "../../../src/rules/links/cluster-connectivity.js";
import { hubPagesRule } from "../../../src/rules/links/hub-pages.js";
import type { ParsedPage } from "../../../src/types.js";

function page(
  url: string,
  resolvedHrefs: string[],
  overrides: Partial<ParsedPage> = {}
): ParsedPage {
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
    resolvedHrefs,
    structureSignature: "",
    contentText: "x ".repeat(200),
    html: "<html><body></body></html>",
    ...overrides
  };
}

describe("clusterConnectivityRule", () => {
  test("returns empty when there is only one cluster", () => {
    const a = page("https://example.com/a.html", ["https://example.com/b.html"]);
    const b = page("https://example.com/b.html", ["https://example.com/a.html"]);
    const known = new Set([a.url, b.url]);
    expect(clusterConnectivityRule([a, b], known)).toEqual([]);
  });

  test("flags a cluster with no outbound links to other clusters", () => {
    const a = page("https://example.com/one/a.html", ["https://example.com/one/b.html"]);
    const b = page("https://example.com/one/b.html", ["https://example.com/one/a.html"]);
    const c = page("https://example.com/two/c.html", []);
    const known = new Set([a.url, b.url, c.url]);
    const findings = clusterConnectivityRule([a, b, c], known);
    expect(findings.some((f) => f.ruleId === "links/cluster-connectivity")).toBe(true);
    expect(findings[0].message).toContain("one/");
  });

  test("does not flag when a cluster receives inbound links from another cluster", () => {
    const a = page("https://example.com/one/a.html", ["https://example.com/one/b.html"]);
    const b = page("https://example.com/one/b.html", ["https://example.com/one/a.html"]);
    const c = page("https://example.com/two/c.html", ["https://example.com/one/a.html"]);
    const known = new Set([a.url, b.url, c.url]);
    expect(clusterConnectivityRule([a, b, c], known)).toEqual([]);
  });

  test("does not flag when a cluster links out to another cluster", () => {
    const a = page("https://example.com/one/a.html", [
      "https://example.com/one/b.html",
      "https://example.com/two/c.html"
    ]);
    const b = page("https://example.com/one/b.html", ["https://example.com/one/a.html"]);
    const c = page("https://example.com/two/c.html", []);
    const known = new Set([a.url, b.url, c.url]);
    expect(clusterConnectivityRule([a, b, c], known)).toEqual([]);
  });
});

describe("hubPagesRule", () => {
  test("flags large sibling sets without index or full hub links", () => {
    const base = "https://example.com/hubtest/";
    const urls = [0, 1, 2, 3].map((i) => `${base}p${i}.html`);
    const pages = urls.map((u) => page(u, []));
    const known = new Set(urls);
    const findings = hubPagesRule(pages, known, 4, 50);
    expect(findings.some((f) => f.ruleId === "links/hub-pages")).toBe(true);
  });

  test("passes when index.html exists in cluster", () => {
    const base = "https://example.com/hubok/";
    const urls = [
      `${base}index.html`,
      `${base}a.html`,
      `${base}b.html`,
      `${base}c.html`
    ];
    const pages = urls.map((u) => page(u, []));
    const known = new Set(urls);
    expect(hubPagesRule(pages, known, 4, 50)).toEqual([]);
  });

  test("passes when index.htm exists in cluster", () => {
    const base = "https://example.com/hubhtm/";
    const urls = [`${base}index.htm`, `${base}a.html`, `${base}b.html`, `${base}c.html`];
    const pages = urls.map((u) => page(u, []));
    const known = new Set(urls);
    expect(hubPagesRule(pages, known, 4, 50)).toEqual([]);
  });

  test("passes when one page links to every sibling", () => {
    const base = "https://example.com/hubmanual/";
    const a = `${base}a.html`;
    const b = `${base}b.html`;
    const c = `${base}c.html`;
    const d = `${base}d.html`;
    const hubUrl = `${base}hub.html`;
    const hubPage = page(hubUrl, [a, b, c, d]);
    const pages = [
      hubPage,
      page(a, []),
      page(b, []),
      page(c, []),
      page(d, [])
    ];
    const known = new Set([a, b, c, d, hubUrl]);
    expect(hubPagesRule(pages, known, 4, 50)).toEqual([]);
  });

  test("emits info when hub checks are skipped for very large sibling sets", () => {
    const base = "https://example.com/big/";
    const urls = Array.from({ length: 51 }, (_, i) => `${base}p${i}.html`);
    const pages = urls.map((u) => page(u, []));
    const known = new Set(urls);
    const findings = hubPagesRule(pages, known, 4, 50);
    expect(findings.some((f) => f.ruleId === "links/hub-pages-skipped")).toBe(true);
  });
});
