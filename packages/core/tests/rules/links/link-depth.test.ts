import { describe, expect, test } from "vitest";
import { linkDepthRule } from "../../../src/rules/links/link-depth.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, resolvedHrefs: string[]): ParsedPage {
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
    contentText: "x",
    html: ""
  };
}

describe("linkDepthRule", () => {
  test("flags disconnected subgraphs that still have internal inbound links", () => {
    const rootUrl = "https://example.com/index.html";
    const index = page(rootUrl, []);
    const u1 = page("https://example.com/u1.html", ["https://example.com/u2.html"]);
    const u2 = page("https://example.com/u2.html", ["https://example.com/u1.html"]);
    const pages = [index, u1, u2];
    const known = new Set(pages.map((p) => p.url));
    const adjacency = new Map<string, Set<string>>();
    const inbound = new Map<string, number>(pages.map((p) => [p.url, 0]));
    for (const p of pages) {
      const links = new Set(p.resolvedHrefs.filter((h) => known.has(h)));
      adjacency.set(p.url, links);
      for (const l of links) {
        inbound.set(l, (inbound.get(l) ?? 0) + 1);
      }
    }

    const findings = linkDepthRule(pages, adjacency, rootUrl, 3, inbound);
    expect(findings.filter((f) => f.ruleId === "links/unreachable-from-root")).toHaveLength(2);
  });
});
