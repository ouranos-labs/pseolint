import { describe, expect, test } from "vitest";
import { classifyPages, isRuleEnabled } from "../src/page-classifier.js";
import type { PageGroupConfig, ParsedPage } from "../src/types.js";

function page(url: string): ParsedPage {
  return {
    url, title: "", metaDescription: "", canonical: "", robotsMeta: "",
    og: { title: "", description: "", image: "" }, hreflangs: [],
    headings: { h1: [], h2: [] }, resolvedHrefs: [], structureSignature: "",
    jsonLd: [], authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "", html: ""
  };
}

describe("classifyPages", () => {
  const groups: Record<string, PageGroupConfig> = {
    pseo: { match: "**/templates/**", rules: ["spam/*", "content/*"] },
    marketing: { match: ["/", "/about"], rules: ["tech/*"] },
    utility: { match: "**/_not-found*", rules: [] },
  };

  test("assigns pages to first matching group", () => {
    const pages = [
      page("https://example.com/templates/ca-llc.html"),
      page("https://example.com/about"),
      page("https://example.com/_not-found.html"),
      page("https://example.com/blog/post.html"),
    ];
    const result = classifyPages(pages, groups);
    expect(result.get("pseo")?.map((p) => p.url)).toEqual(["https://example.com/templates/ca-llc.html"]);
    expect(result.get("marketing")?.map((p) => p.url)).toEqual(["https://example.com/about"]);
    expect(result.get("utility")?.map((p) => p.url)).toEqual(["https://example.com/_not-found.html"]);
    expect(result.get("__default")?.map((p) => p.url)).toEqual(["https://example.com/blog/post.html"]);
  });

  test("returns all pages in __default when no groups configured", () => {
    const pages = [page("https://example.com/a"), page("https://example.com/b")];
    const result = classifyPages(pages, undefined);
    expect(result.get("__default")).toHaveLength(2);
  });

  test("returns all pages in __default when groups is empty object", () => {
    const pages = [page("https://example.com/a")];
    const result = classifyPages(pages, {});
    expect(result.get("__default")).toHaveLength(1);
  });

  test("handles filesystem paths with backslashes", () => {
    const fsGroups: Record<string, PageGroupConfig> = {
      pseo: { match: "**/templates/**" },
    };
    const pages = [page("C:\\site\\templates\\ca-llc.html")];
    const result = classifyPages(pages, fsGroups);
    expect(result.get("pseo")).toHaveLength(1);
  });
});

describe("isRuleEnabled", () => {
  test("returns true when rules list includes matching glob", () => {
    expect(isRuleEnabled("spam/thin-content", ["spam/*", "content/*"])).toBe(true);
  });

  test("returns false when rules list does not match", () => {
    expect(isRuleEnabled("spam/thin-content", ["tech/*"])).toBe(false);
  });

  test("returns true when rules is undefined (all enabled)", () => {
    expect(isRuleEnabled("spam/thin-content", undefined)).toBe(true);
  });

  test("returns false when rules is empty array (skip group)", () => {
    expect(isRuleEnabled("spam/thin-content", [])).toBe(false);
  });

  test("matches exact rule ID", () => {
    expect(isRuleEnabled("spam/thin-content", ["spam/thin-content"])).toBe(true);
    expect(isRuleEnabled("spam/thin-content", ["spam/near-duplicate"])).toBe(false);
  });
});
