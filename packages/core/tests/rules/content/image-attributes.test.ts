import { describe, expect, test } from "vitest";
import { imageAttributesRule } from "../../../src/rules/content/image-attributes.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, html: string): ParsedPage {
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
    html,
  };
}

const sized = (n: number, extra = "") =>
  Array.from({ length: n }, (_, i) => `<img src="/p${i}.jpg" width="800" height="600"${extra}>`).join("");

describe("imageAttributesRule", () => {
  test("skips pages with no images and pages with no html", () => {
    expect(imageAttributesRule([page("https://ex.com/", "<html><p>text</p></html>")])).toEqual([]);
    expect(imageAttributesRule([page("https://ex.com/", "")])).toEqual([]);
  });

  test("fully sized and responsive images produce nothing", () => {
    const html = `<html>${sized(4, ' srcset="/p.jpg 1x, /p2.jpg 2x"')}</html>`;
    expect(imageAttributesRule([page("https://ex.com/", html)])).toEqual([]);
  });

  test("all images unsized warns and cites layout shift", () => {
    const html = `<html><img src="/a.jpg"><img src="/b.jpg"><img src="/c.jpg" srcset="/c2.jpg 2x"></html>`;
    const findings = imageAttributesRule([page("https://ex.com/", html)]);
    const dims = findings.filter((f) => f.severity === "warning");
    expect(dims).toHaveLength(1);
    expect(dims[0].ruleId).toBe("content/image-attributes");
    expect(dims[0].message).toContain("3 of 3");
    expect(dims[0].message).toContain("Cumulative Layout Shift");
    expect(dims[0].message).toContain("/a.jpg");
  });

  test("a minority unsized is info, not warning", () => {
    const html = `<html>${sized(9)}<img src="/odd.jpg"></html>`;
    const findings = imageAttributesRule([page("https://ex.com/", html)]);
    expect(findings.filter((f) => f.severity === "warning")).toEqual([]);
    const info = findings.filter((f) => f.message.includes("1 of 10"));
    expect(info).toHaveLength(1);
    expect(info[0].severity).toBe("info");
  });

  test("inline width/height/aspect-ratio counts as sized", () => {
    for (const style of ["width: 100%; height: auto", "aspect-ratio: 16/9", "height:400px"]) {
      const html = `<html><img src="/a.jpg" style="${style}" srcset="/a2.jpg 2x"></html>`;
      expect(imageAttributesRule([page("https://ex.com/", html)])).toEqual([]);
    }
  });

  test("width without height is still unsized (no aspect ratio derivable)", () => {
    const html = `<html><img src="/a.jpg" width="800" srcset="/a2.jpg 2x"></html>`;
    const findings = imageAttributesRule([page("https://ex.com/", html)]);
    expect(findings.some((f) => f.message.includes("1 of 1"))).toBe(true);
  });

  test("aria-hidden spacers are excluded from the denominator", () => {
    const html = `<html>${sized(2)}<img src="/spacer.gif" aria-hidden="true"></html>`;
    const findings = imageAttributesRule([page("https://ex.com/", html)]);
    expect(findings.filter((f) => f.message.includes("of 3"))).toEqual([]);
  });

  test("decorative role=presentation still counts, because it still shifts layout", () => {
    const html = `<html><img src="/deco.jpg" role="presentation"></html>`;
    const findings = imageAttributesRule([page("https://ex.com/", html)]);
    expect(findings.some((f) => f.message.includes("1 of 1"))).toBe(true);
  });

  test("three or more images with no srcset anywhere is an info nudge", () => {
    const findings = imageAttributesRule([page("https://ex.com/", `<html>${sized(3)}</html>`)]);
    const resp = findings.filter((f) => f.message.includes("srcset"));
    expect(resp).toHaveLength(1);
    expect(resp[0].severity).toBe("info");
    // Recommended, never required: must not overstate (docs/folklore.md).
    expect(resp[0].message).toContain("guidance rather than a requirement");
    expect(resp[0].message).toContain("no image dimension or byte limit is documented");
  });

  test("a <picture> element satisfies the responsive check", () => {
    const html = `<html><picture><source srcset="/a.webp"><img src="/a.jpg" width="8" height="6"></picture>${sized(2)}</html>`;
    const findings = imageAttributesRule([page("https://ex.com/", html)]);
    expect(findings.filter((f) => f.message.includes("srcset"))).toEqual([]);
  });

  test("two images without srcset stay under the responsive floor", () => {
    const findings = imageAttributesRule([page("https://ex.com/", `<html>${sized(2)}</html>`)]);
    expect(findings).toEqual([]);
  });

  test("data: URI sources are never used as report samples", () => {
    const html = `<html><img src="data:image/gif;base64,R0lGOD"><img src="/real.jpg"></html>`;
    const findings = imageAttributesRule([page("https://ex.com/", html)]);
    expect(findings[0].message).not.toContain("data:image");
    expect(findings[0].message).toContain("/real.jpg");
  });

  test("single-quoted and unquoted attributes parse", () => {
    const html = `<html><img src='/a.jpg' width='800' height='600' srcset='/a2.jpg 2x'><img src=/b.jpg width=800 height=600></html>`;
    expect(imageAttributesRule([page("https://ex.com/", html)])).toEqual([]);
  });
});
