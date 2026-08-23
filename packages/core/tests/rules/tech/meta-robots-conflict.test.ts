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

  // Google documents the multi-tag form as valid and deterministic: "the search
  // engine will use the sum of the negative rules", with two separate robots
  // tags as its own worked example. noindex + "noindex, noarchive" therefore
  // resolves to noindex, noarchive. Nothing is ambiguous, so nothing is
  // reported. https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
  test("no finding when two meta robots tags differ but do not contradict", () => {
    const findings = metaRobotsConflictRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="noindex"><meta name="robots" content="noindex, noarchive"></head>'
      ),
    ]);
    expect(findings).toEqual([]);
  });

  // The common split-directive shape: indexing rules in one tag, snippet
  // budgets in another. Also not a contradiction.
  test("no finding for split directives across two meta robots tags", () => {
    const findings = metaRobotsConflictRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="index, follow"><meta name="robots" content="max-snippet:-1, max-image-preview:large"></head>'
      ),
    ]);
    expect(findings).toEqual([]);
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
  // Google: "The X-Robots-Tag may optionally specify a user agent before the
  // rules. For instance ... X-Robots-Tag: googlebot: nofollow"
  // normalizeDirectives split on commas only, so the header yielded the token
  // "googlebot: noindex", which matched nothing: the rule missed the exact
  // conflict that deindexes the page.
  test("user-agent-prefixed X-Robots-Tag conflicts with a meta index directive", () => {
    const findings = metaRobotsConflictRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="index, follow"></head>',
        "googlebot: noindex, nofollow"
      ),
    ]);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
    expect(findings[0].message).toContain("googlebot");
    expect(findings[0].message).toContain("noindex");
  });

  test("several user-agent groups in one folded header each keep their own rules", () => {
    // Two X-Robots-Tag response headers are folded into one comma-joined value
    // by the HTTP stack, so a prefix can appear mid-string.
    const findings = metaRobotsConflictRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="index"></head>',
        "googlebot: nofollow, otherbot: noindex, nofollow"
      ),
    ]);
    // otherbot's noindex is not Google's behaviour, so index/noindex must NOT fire.
    expect(findings).toEqual([]);
  });

  test("a value directive's colon is not mistaken for a user-agent prefix", () => {
    const findings = metaRobotsConflictRule([
      page(
        "https://ex.com/a",
        '<head><meta name="robots" content="noindex"></head>',
        "max-snippet:-1, index"
      ),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toContain("X-Robots-Tag header");
    expect(findings[0].message).not.toContain("max-snippet");
  });

  test("a wildcard user agent applies to Google", () => {
    const findings = metaRobotsConflictRule([
      page("https://ex.com/a", '<head><meta name="robots" content="index"></head>', "*: noindex"),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });
});
