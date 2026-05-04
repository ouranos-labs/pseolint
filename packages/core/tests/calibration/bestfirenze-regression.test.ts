/**
 * bestfirenze.com calibration regression — v0.5.3–v0.5.6 stack guard.
 *
 * bestfirenze.com is a 6-page Florence tourism directory whose pages are
 * 100% identical Google Places regurgitation with 0 unique content. Before
 * v0.5.3 the engine classified it as `small-marketing` → applied severity
 * demotions → verdict "caution" / risk 37. The v0.5.3 degeneration-guard
 * (median word count < 50) trips the guard: classification downgrades to
 * `unclear` and a synthetic profile with EMPTY severityOverrides applies —
 * so spam/thin-content and aeo/citable-facts fire at native error severity.
 * This drives the blocker density ≥ 0.5 → risk floor 60 → verdict
 * "concerning". Contrast: the old small-marketing path demoted all these
 * rules to "info", leaving risk at 37 / "caution" (a false-negative).
 *
 * Guards:
 *  v0.5.3  applyDegenerationGuard — median-thin corpus resets classification
 *          to `unclear` and profileFor returns empty severityOverrides so
 *          no demotion table fires.
 *  v0.5.4  appliedSeverityDemotions is absent/empty because the synthetic
 *          degeneration-guard profile has no overrides to apply.
 *  v0.5.5  content/translation-no-op MIN_WORDS_FOR_TRANSLATION_CHECK=30 floor
 *          skips clusters where ALL variants are below 30 words (prevents
 *          confusing "didn't translate" finding on empty pages).
 *  v0.5.6  content/regurgitated-content detects Google Places signals
 *          (attribution link + >60% googleusercontent images).
 *
 * Fixtures are minimal synthetic HTML — empty body (0 words), single shared
 * title, Google Maps attribution link + 6 googleusercontent.com images.
 */

import { afterEach, describe, expect, it } from "vitest";
import { auditSource } from "../../src/auditor.js";
import type { AuditSummary, RuleResult } from "../../src/types.js";

// ---------------------------------------------------------------------------
// Fixture HTML
// ---------------------------------------------------------------------------

/** Shared title seen on all 6 real bestfirenze.com pages. */
const TITLE = "Best of Florence - Discover Authentic Florence | BestFirenze.com";

/**
 * Synthetic page HTML. Key signals that trip content/regurgitated-content:
 *   1. Google Maps attribution link with rel="noopener" (checkGoogleAttribution)
 *   2. 6 googleusercontent.com img srcs, >=60% of all images (checkGoogleImagesDominate)
 * Body text is intentionally empty (0 words) — mirrors the real site, trips
 * spam/thin-content at native error severity, and causes translation-no-op to
 * skip (all variants below MIN_WORDS_FOR_TRANSLATION_CHECK=30).
 */
const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${TITLE}</title>
  <meta name="description" content="Discover the best of Florence Italy with BestFirenze.com." />
  <link rel="canonical" href="https://bestfirenze.com/" />
</head>
<body>
  <!-- Google Places attribution — trips checkGoogleAttribution -->
  <a href="https://google.com/maps/place/Florence+Italy" rel="noopener">Powered by Google</a>

  <!-- 6 googleusercontent images out of 6 total images (100% >= 60% threshold)
       — trips checkGoogleImagesDominate (MIN_IMAGES_FOR_RATIO_CHECK=3) -->
  <img src="https://lh3.googleusercontent.com/p/photo1.jpg" alt="" />
  <img src="https://lh3.googleusercontent.com/p/photo2.jpg" alt="" />
  <img src="https://lh3.googleusercontent.com/p/photo3.jpg" alt="" />
  <img src="https://lh3.googleusercontent.com/p/photo4.jpg" alt="" />
  <img src="https://lh3.googleusercontent.com/p/photo5.jpg" alt="" />
  <img src="https://lh3.googleusercontent.com/p/photo6.jpg" alt="" />
</body>
</html>`;

/** Pages served at each of the 6 real bestfirenze.com paths. */
const PAGES: Record<string, string> = {
  "https://bestfirenze.com/":   PAGE_HTML,
  "https://bestfirenze.com/en": PAGE_HTML,
  "https://bestfirenze.com/fr": PAGE_HTML,
  "https://bestfirenze.com/it": PAGE_HTML,
  "https://bestfirenze.com/de": PAGE_HTML,
  "https://bestfirenze.com/es": PAGE_HTML,
};

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://bestfirenze.com/</loc></url>
  <url><loc>https://bestfirenze.com/en</loc></url>
  <url><loc>https://bestfirenze.com/fr</loc></url>
  <url><loc>https://bestfirenze.com/it</loc></url>
  <url><loc>https://bestfirenze.com/de</loc></url>
  <url><loc>https://bestfirenze.com/es</loc></url>
</urlset>`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allIssues(summary: AuditSummary): RuleResult[] {
  return [
    ...summary.issues.blockers,
    ...summary.issues.shouldFix,
    ...summary.issues.informational,
  ];
}

function byRule(summary: AuditSummary, ruleId: string): RuleResult[] {
  return allIssues(summary).filter((f) => f.ruleId === ruleId);
}

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function installMockFetch(): void {
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url === "https://bestfirenze.com/sitemap.xml") {
      return new Response(SITEMAP_XML, {
        status: 200,
        headers: { "content-type": "application/xml" },
      });
    }
    const html = PAGES[url];
    if (html) {
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response("Not found", { status: 404 });
  }) as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("bestfirenze.com calibration regression (v0.5.3–v0.5.6)", () => {
  let summary: AuditSummary;

  it("runs the audit without throwing", async () => {
    installMockFetch();
    summary = await auditSource("https://bestfirenze.com/sitemap.xml");
    expect(summary).toBeDefined();
  }, 30_000);

  it("audits all 6 pages", () => {
    expect(summary.pageCount).toBe(6);
  });

  it("[v0.5.3] siteClassification.type is 'unclear' (degeneration-guard tripped on median-thin)", () => {
    // Before v0.5.3 this was 'small-marketing' → severity demotions applied.
    expect(summary.siteClassification.type).toBe("unclear");
  });

  it("[v0.5.3] degeneration-guard-tripped signal is present in classification signals", () => {
    const guard = summary.siteClassification.signals.some(
      (s) => s.kind === "degeneration-guard-tripped",
    );
    expect(guard).toBe(true);
  });

  it("[v0.5.3] no severity demotions applied (degeneration-guard synthetic profile has empty overrides)", () => {
    // When degeneration-guard trips, profileFor() returns a synthetic profile with
    // empty severityOverrides. computeAppliedDemotions finds nothing to track, so
    // summary.appliedSeverityDemotions is undefined (collapsed from empty array).
    const demotions = summary.appliedSeverityDemotions ?? [];
    expect(demotions).toHaveLength(0);
  });

  it("[v0.5.3/v0.5.5] spam/thin-content fires at native error severity on all 6 pages", () => {
    const findings = byRule(summary, "spam/thin-content");
    expect(findings.length).toBe(6);
    // Every finding must be error (not demoted to info by small-marketing profile).
    for (const f of findings) {
      expect(f.severity).toBe("error");
    }
  });

  it("[v0.5.5] content/translation-no-op produces no findings (all pages below 30-word floor)", () => {
    // All 6 pages have 0 words — below MIN_WORDS_FOR_TRANSLATION_CHECK.
    // The rule skips clusters where every variant is under the floor, so no
    // findings should fire even though similarity is 1.0 across all variants.
    expect(byRule(summary, "content/translation-no-op")).toHaveLength(0);
  });

  it("[v0.5.6] content/regurgitated-content fires on at least one page", () => {
    // Google Maps attribution + 6 googleusercontent.com images triggers >=2 signals.
    expect(byRule(summary, "content/regurgitated-content").length).toBeGreaterThan(0);
  });

  it("[v0.5.3] risk score floors at >= 60 (blocker density drives floor)", () => {
    // With 6 thin-content errors and near-duplicate blockers on a 6-page site,
    // blocker density >= 0.5 → risk floor 60.
    expect(summary.risk).toBeGreaterThanOrEqual(60);
  });

  it("[v0.5.3] verdict is at least concerning (pre-fix was caution at risk 37)", () => {
    // verdictForRisk: risk ≤ 40 → caution, ≤ 60 → concerning, > 60 → critical.
    // Post-fix risk = 60 (blocker-density floor) → "concerning".
    // Pre-fix: small-marketing demotions reduced risk to 37 → "caution".
    // The regression guard: verdict must be *worse* than caution.
    const VERDICT_RANK = { ready: 0, caution: 1, concerning: 2, critical: 3 } as const;
    expect(VERDICT_RANK[summary.verdict]).toBeGreaterThanOrEqual(VERDICT_RANK.concerning);
  });
});
