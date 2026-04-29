import { describe, expect, test } from "vitest";
import { clusterConnectivityRule } from "../../../src/rules/links/cluster-connectivity.js";
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
