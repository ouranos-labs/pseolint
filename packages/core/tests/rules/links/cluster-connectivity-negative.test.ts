import { describe, expect, test } from "vitest";
import { clusterConnectivityRule } from "../../../src/rules/links/cluster-connectivity.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, hrefs: string[] = []): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: hrefs, structureSignature: "", contentText: "", html: "",
  };
}

// sampled-suppression.test.ts covers the positive (both clusters siloed) and the
// sampled=true no-op. These pin the branches it doesn't: that a single cross-cluster
// link clears the silo verdict, and that single-page clusters are ignored.
describe("clusterConnectivityRule: non-firing branches", () => {
  test("an outbound cross-cluster link clears the silo for that cluster", () => {
    const pages = [
      page("https://s/x/1", ["https://s/y/1"]), // x -> y outbound
      page("https://s/x/2"),
      page("https://s/y/1"),
      page("https://s/y/2"),
    ];
    const known = new Set(pages.map((p) => p.url));
    const findings = clusterConnectivityRule(pages, known, false);
    const flagged = findings.map((f) => f.message);
    // x has outbound to y; y has inbound from x: neither is fully siloed.
    expect(flagged.some((m) => m.includes("/x/"))).toBe(false);
    expect(flagged.some((m) => m.includes("/y/"))).toBe(false);
  });

  test("single-page clusters are not flagged (need 2+ pages to be a cluster)", () => {
    const pages = [page("https://s/x/1"), page("https://s/y/1")];
    const known = new Set(pages.map((p) => p.url));
    expect(clusterConnectivityRule(pages, known, false)).toEqual([]);
  });

  test("fewer than two clusters total: nothing to silo against", () => {
    const pages = [page("https://s/x/1"), page("https://s/x/2")];
    const known = new Set(pages.map((p) => p.url));
    expect(clusterConnectivityRule(pages, known, false)).toEqual([]);
  });
});
