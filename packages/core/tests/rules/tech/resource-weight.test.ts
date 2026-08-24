import { describe, expect, test } from "vitest";
import { resourceWeightRule } from "../../../src/rules/tech/resource-weight.js";
import type { ParsedPage, PageResources } from "../../../src/types.js";

const MB = 1024 * 1024;

function page(url: string, resources?: PageResources): ParsedPage {
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
    resolvedHrefs: [],
    structureSignature: "",
    contentText: "",
    html: "<html></html>",
    resources,
  };
}

function res(partial: Partial<PageResources> & { largest: PageResources["largest"] }): PageResources {
  const total = partial.totalBytes ?? partial.largest.reduce((n, r) => n + r.bytes, 0);
  return {
    totalBytes: total,
    byKind: partial.byKind ?? { image: 0, script: total, stylesheet: 0, font: 0, other: 0 },
    largest: partial.largest,
  };
}

describe("resourceWeightRule", () => {
  test("no-ops without --render data", () => {
    expect(resourceWeightRule([page("https://ex.com/")])).toEqual([]);
  });

  test("no-ops when every asset was opaque (all zero bytes)", () => {
    const findings = resourceWeightRule([
      page("https://ex.com/", { totalBytes: 0, byKind: { image: 0, script: 0, stylesheet: 0, font: 0, other: 0 }, largest: [] }),
    ]);
    expect(findings).toEqual([]);
  });

  test("a subresource at the 2 MB cutoff errors, naming the file", () => {
    const findings = resourceWeightRule([
      page("https://ex.com/", res({ largest: [{ url: "https://ex.com/bundle.js", bytes: 2 * MB, kind: "script" }] })),
    ]);
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0].ruleId).toBe("tech/resource-weight");
    expect(errors[0].message).toContain("bundle.js");
    expect(errors[0].message).toContain("2.0 MB");
  });

  test("this is what tech/html-size misses: a small page with a huge script still errors", () => {
    // The regression this rule exists for. The HTML is trivial, so
    // tech/html-size stays silent, but the cited limit is per fetched file.
    const findings = resourceWeightRule([
      page("https://ex.com/light", res({ largest: [{ url: "https://cdn.ex.com/vendor.js", bytes: 3 * MB, kind: "script" }] })),
    ]);
    expect(findings.some((f) => f.severity === "error")).toBe(true);
  });

  test("a subresource within 25% of the cutoff warns rather than errors", () => {
    const findings = resourceWeightRule([
      page("https://ex.com/", res({ largest: [{ url: "https://ex.com/app.js", bytes: 1.6 * MB, kind: "script" }] })),
    ]);
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
    const warnings = findings.filter((f) => f.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain("app.js");
  });

  test("a comfortably sized asset produces nothing", () => {
    const findings = resourceWeightRule([
      page("https://ex.com/", res({ largest: [{ url: "https://ex.com/app.js", bytes: 400 * 1024, kind: "script" }] })),
    ]);
    expect(findings).toEqual([]);
  });

  test("total weight past the reporting floor is info, and disclaims any crawl limit", () => {
    const findings = resourceWeightRule([
      page("https://ex.com/heavy", res({
        totalBytes: 21 * MB,
        byKind: { image: 18 * MB, script: 2 * MB, stylesheet: 512 * 1024, font: 512 * 1024, other: 0 },
        largest: [{ url: "https://ex.com/hero.png", bytes: 900 * 1024, kind: "image" }],
      })),
    ]);
    const info = findings.filter((f) => f.severity === "info");
    expect(info).toHaveLength(1);
    expect(info[0].message).toContain("21.0 MB");
    expect(info[0].message).toContain("image 18.0 MB");
    // Must never present total weight as a crawl limit (docs/folklore.md #4).
    expect(info[0].message).toContain("no total-page-weight");
  });

  test("total weight below the reporting floor stays quiet", () => {
    const findings = resourceWeightRule([
      page("https://ex.com/", res({
        totalBytes: 3 * MB,
        byKind: { image: 3 * MB, script: 0, stylesheet: 0, font: 0, other: 0 },
        largest: [{ url: "https://ex.com/a.png", bytes: 900 * 1024, kind: "image" }],
      })),
    ]);
    expect(findings).toEqual([]);
  });

  test("long asset URLs are truncated and query strings dropped", () => {
    const long = `https://ex.com/${"a".repeat(200)}/bundle.js?v=123456`;
    const findings = resourceWeightRule([
      page("https://ex.com/", res({ largest: [{ url: long, bytes: 2 * MB, kind: "script" }] })),
    ]);
    expect(findings[0].message).not.toContain("?v=");
    expect(findings[0].message).toContain("...");
  });
});

// Boundary: a file sitting EXACTLY on the 2 MiB cutoff. Found by mutation
// testing, which flipped `bytes < PER_FILE_ERROR_BYTES` to `<=` in the "near"
// filter and the suite stayed green: nothing asserted what happens at the
// cutoff itself. With `<=`, a 2 MiB file matches both `over` and `near` and is
// reported twice, once as an error and once as a warning, for one asset.
// Google's limit is "the first 2MB", so 2 MiB exactly IS truncated: error only.
describe("resource-weight boundary", () => {
  test("a file exactly at the 2 MiB cutoff is an error, and is not also a warning", () => {
    const findings = resourceWeightRule([
      page("https://ex.com/a", res({ largest: [{ url: "https://ex.com/app.js", bytes: 2 * MB, kind: "script" }] })),
    ]);
    const errors = findings.filter((f) => f.severity === "error");
    const warnings = findings.filter((f) => f.severity === "warning");
    expect(errors).toHaveLength(1);
    expect(warnings).toHaveLength(0);
    // and the same asset must not appear in two findings at once
    expect(findings.filter((f) => f.message.includes("app.js"))).toHaveLength(1);
  });

  test("a file one byte under the cutoff is a warning, not an error", () => {
    const findings = resourceWeightRule([
      page("https://ex.com/a", res({ largest: [{ url: "https://ex.com/app.js", bytes: 2 * MB - 1, kind: "script" }] })),
    ]);
    expect(findings.filter((f) => f.severity === "error")).toHaveLength(0);
    expect(findings.filter((f) => f.severity === "warning")).toHaveLength(1);
  });
});
