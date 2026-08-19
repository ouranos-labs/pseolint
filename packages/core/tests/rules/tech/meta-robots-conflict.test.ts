import { describe, expect, test } from "vitest";
import { metaRobotsConflictRule } from "../../../src/rules/tech/meta-robots-conflict.js";
import type { ParsedPage } from "../../../src/types.js";

function page(url: string, html: string, xRobotsTag = ""): ParsedPage {
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
    httpMeta: xRobotsTag
      ? { statusCode: 200, finalUrl: url, redirectChain: [], xRobotsTag, linkHeader: "" }
      : undefined,
  };
}

describe("metaRobotsConflictRule", () => {
  test("error when meta robots says noindex but X-Robots-Tag header says index", () => {
    const findings = metaRobotsConflictRule([
      page("https://ex.com/a", '<head><meta name="robots" content="noindex"></head>', "index"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe("tech/meta-robots-conflict");
    expect(findings[0].severity).toBe("error");
    expect(findings[0].confidence).toBe("high");
    expect(findings[0].message).toContain("meta robots");
    expect(findings[0].message).toContain("X-Robots-Tag header");
  });

  test('X-Robots-Tag "noindex, follow" + meta "index" → error', () => {
    const findings = metaRobotsConflictRule([
      page("https://ex.com/a", '<head><meta name="robots" content="index"></head>', "noindex, follow"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("noindex");
  });

  test("single noindex alone is NOT a conflict (intentional noindexing)", () => {
    const findings = metaRobotsConflictRule([
      page("https://ex.com/a", '<head><meta name="robots" content="noindex, nofollow"></head>'),
    ]);
    expect(findings).toEqual([]);
  });

  test("follow vs nofollow across meta robots and meta googlebot → error", () => {
    const findings = metaRobotsConflictRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="index, follow"><meta name="googlebot" content="nofollow"></head>'
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("meta googlebot");
  });

  test("warning when two meta robots tags carry different content strings", () => {
    const findings = metaRobotsConflictRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="noindex"><meta name="robots" content="noindex, noarchive"></head>'
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toContain("2");
  });

  test("no finding for duplicate meta robots tags with identical content", () => {
    const findings = metaRobotsConflictRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="noindex"><meta name="robots" content="noindex"></head>'
      ),
    ]);
    expect(findings).toEqual([]);
  });

  test("both index/noindex and follow/nofollow conflicts each produce an error", () => {
    const findings = metaRobotsConflictRule([
      page("https://ex.com/a", '<head><meta name="robots" content="index, follow"></head>', "noindex, nofollow"),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
  });

  test("normalizes case and whitespace in directive lists", () => {
    const findings = metaRobotsConflictRule([
      page("https://ex.com/a", "<head><meta name='ROBOTS' content=' NoIndex , Follow '></head>", "INDEX"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  test("handles attribute order variation (content before name)", () => {
    const findings = metaRobotsConflictRule([
      page("https://ex.com/a", '<head><meta content="noindex" name="robots"></head>', "index"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  test("empty html and no header → no finding", () => {
    const findings = metaRobotsConflictRule([page("https://ex.com/a", "")]);
    expect(findings).toEqual([]);
  });

  test("unrelated meta tags are ignored", () => {
    const findings = metaRobotsConflictRule([
      page("https://ex.com/a", '<head><meta name="description" content="index of things"></head>'),
    ]);
    expect(findings).toEqual([]);
  });
});
