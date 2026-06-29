import { describe, expect, test } from "vitest";
import { deadEndsRule } from "../../../src/rules/links/dead-ends.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, resolvedHrefs: string[] = []): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs, structureSignature: "", contentText: "", html: "",
  };
}

describe("deadEndsRule", () => {
  const known = new Set(["https://s/", "https://s/a", "https://s/b"]);

  test("flags a page with no outbound links to other known pages", () => {
    const pages = [page("https://s/a", [])];
    const findings = deadEndsRule(pages, known);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("links/dead-ends");
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].pageUrl).toBe("https://s/a");
  });

  test("does not flag a page that links to another known page", () => {
    const pages = [page("https://s/a", ["https://s/b"])];
    expect(deadEndsRule(pages, known)).toEqual([]);
  });

  test("a self-link does not rescue a dead end", () => {
    const pages = [page("https://s/a", ["https://s/a"])];
    expect(deadEndsRule(pages, known)).toHaveLength(1);
  });

  test("links to external/unknown URLs do not count as outbound", () => {
    const pages = [page("https://s/a", ["https://external.com/x"])];
    expect(deadEndsRule(pages, known)).toHaveLength(1);
  });

  test("excludes the root URL from dead-end reporting", () => {
    const pages = [page("https://s/", [])];
    expect(deadEndsRule(pages, known, "https://s/")).toEqual([]);
  });
});
