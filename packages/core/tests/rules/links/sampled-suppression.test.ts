import { describe, expect, test } from "vitest";
import { orphanPagesRule } from "../../../src/rules/links/orphan-pages.js";
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

describe("crawl-sampling suppression (calibration FP fix)", () => {
  test("orphan-pages: fires error on a full crawl, suppressed when sampled", () => {
    const pages = [page("https://s/"), page("https://s/a"), page("https://s/b")];
    const inbound = new Map([["https://s/a", 0], ["https://s/b", 1]]);
    const full = orphanPagesRule(pages, inbound, "https://s/", false);
    expect(full).toHaveLength(1);
    expect(full[0].severity).toBe("error");
    expect(full[0].pageUrl).toBe("https://s/a");
    expect(orphanPagesRule(pages, inbound, "https://s/", true)).toEqual([]);
  });

  test("cluster-connectivity: flags silos on a full crawl, suppressed when sampled", () => {
    const pages = [page("https://s/x/1"), page("https://s/x/2"), page("https://s/y/1"), page("https://s/y/2")];
    const known = new Set(pages.map((p) => p.url));
    const full = clusterConnectivityRule(pages, known, false);
    expect(full.length).toBeGreaterThanOrEqual(1); // both clusters siloed (no cross-links)
    expect(clusterConnectivityRule(pages, known, true)).toEqual([]);
  });
});
