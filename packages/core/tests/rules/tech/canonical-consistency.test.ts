import { describe, expect, test } from "vitest";
import { canonicalConsistencyRule } from "../../../src/rules/tech/canonical-consistency.js";
import type { NormalizeUrlOptions, ParsedPage } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: url,
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    resolvedHrefs: [],
    structureSignature: "",
    contentText: "",
    html: "",
    ...overrides
  };
}

const normalizeOpts: NormalizeUrlOptions = { stripQuery: true, stripWwwHost: false };

describe("canonical-consistency rule", () => {
  // ── EXISTING BEHAVIOUR ──────────────────────────────────────────────────────

  test("flags missing canonical on a page", () => {
    const a = page("https://example.dev/a", { canonical: "" });
    const findings = canonicalConsistencyRule([a], new Set([a.url]), normalizeOpts);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/missing a canonical/);
    expect(findings[0].severity).toBe("error");
  });

  test("flags canonical that points to another crawled page (warning)", () => {
    const a = page("https://example.dev/a");
    const b = page("https://example.dev/b", { canonical: "https://example.dev/a" });
    const findings = canonicalConsistencyRule([a, b], new Set([a.url, b.url]), normalizeOpts);
    const f = findings.find((r) => r.pageUrl === b.url && r.ruleId === "tech/canonical-consistency");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("warning");
    expect(f!.message).toMatch(/canonicalizes to another crawled page/);
  });

  test("HTTP Link-header vs HTML canonical conflict is flagged as error", () => {
    // page.url is /c, HTML canonical is /a (different), HTTP header says /b (different from HTML)
    // → rule first emits the "canonicalizes to another crawled page" finding, then the conflict
    const a = page("https://example.dev/c", {
      canonical: "https://example.dev/a",
      httpMeta: {
        statusCode: 200,
        finalUrl: "https://example.dev/c",
        redirectChain: [],
        xRobotsTag: "",
        linkHeader: '<https://example.dev/b>; rel="canonical"'
      }
    });
    const knownUrls = new Set(["https://example.dev/a", "https://example.dev/b", "https://example.dev/c"]);
    const findings = canonicalConsistencyRule([a], knownUrls, normalizeOpts);
    const conflict = findings.find((f) => f.message.includes("conflicting canonical"));
    expect(conflict).toBeDefined();
    expect(conflict!.severity).toBe("error");
  });

  // ── NEW BEHAVIOUR: uniform alternate-host collapse ───────────────────────────

  test("5 pages all canonicalising to the same prod host while crawled as staging → exactly ONE site-level info finding", () => {
    const stagingBase = "https://staging.example.com";
    const prodBase = "https://example.com";
    const slugs = ["/", "/about", "/blog", "/contact", "/pricing"];

    const pages = slugs.map((slug) =>
      page(`${stagingBase}${slug}`, { canonical: `${prodBase}${slug}` })
    );
    const knownUrls = new Set(pages.map((p) => p.url));
    const findings = canonicalConsistencyRule(pages, knownUrls, normalizeOpts);

    // Must be exactly ONE finding (the site-level collapse)
    expect(findings).toHaveLength(1);
    const f = findings[0];
    expect(f.severity).toBe("info");
    expect(f.ruleId).toBe("tech/canonical-consistency");
    // Message should mention the count and both hosts
    expect(f.message).toMatch(/5/);
    expect(f.message).toMatch(/example\.com/);
    expect(f.message).toMatch(/staging\.example\.com/);
  });

  test("alternate-host collapse threshold: 2 pages to prod → still collapses to one info finding", () => {
    const pages = [
      page("https://preview.site.io/a", { canonical: "https://site.io/a" }),
      page("https://preview.site.io/b", { canonical: "https://site.io/b" })
    ];
    const knownUrls = new Set(pages.map((p) => p.url));
    const findings = canonicalConsistencyRule(pages, knownUrls, normalizeOpts);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
  });

  test("single page canonicalising to a different host is still a per-page info finding (not site-level)", () => {
    const a = page("https://staging.example.com/lone", {
      canonical: "https://example.com/lone"
    });
    const findings = canonicalConsistencyRule([a], new Set([a.url]), normalizeOpts);
    // Single page: no collapse, but still flagged as info (outside crawl scope)
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("info");
    expect(findings[0].pageUrl).toBe(a.url); // per-page, not site-level
  });

  test("inconsistent cross-host canonicals (different pages point to different hosts) → per-page findings, not collapsed", () => {
    // page A → host X, page B → host Y (inconsistent)
    const a = page("https://staging.example.com/a", { canonical: "https://prod-a.example.com/a" });
    const b = page("https://staging.example.com/b", { canonical: "https://prod-b.example.com/b" });
    const knownUrls = new Set([a.url, b.url]);
    const findings = canonicalConsistencyRule([a, b], knownUrls, normalizeOpts);
    // Two different target hosts → per-page findings, not one site-level finding
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.pageUrl !== undefined)).toBe(true);
  });

  // ── DEDUP: no double-firing on the same page ─────────────────────────────────

  test("page with a cross-scope canonical does NOT also emit an HTTP-vs-HTML conflict for the same canonical", () => {
    // HTML canonical → prod host, HTTP Link header also → prod host (they agree);
    // the only issue is "outside crawl scope"; should fire exactly once.
    const a = page("https://staging.example.com/page", {
      canonical: "https://example.com/page",
      httpMeta: {
        statusCode: 200,
        finalUrl: "https://staging.example.com/page",
        redirectChain: [],
        xRobotsTag: "",
        linkHeader: '<https://example.com/page>; rel="canonical"'
      }
    });
    const pages = [a];
    const knownUrls = new Set(pages.map((p) => p.url));
    const findings = canonicalConsistencyRule(pages, knownUrls, normalizeOpts);

    // Since both HTML and HTTP agree on the same canonical, no conflict finding.
    // The single page pointing to a different host produces one info finding.
    const conflictFindings = findings.filter((f) => f.message.includes("conflicting canonical"));
    expect(conflictFindings).toHaveLength(0);
  });
});
