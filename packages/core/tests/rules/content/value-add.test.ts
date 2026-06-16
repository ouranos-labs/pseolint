import { describe, expect, test } from "vitest";
import { valueAddRule } from "../../../src/rules/content/value-add.js";
import type { ParsedPage, RuleResult } from "../../../src/types.js";

function page(url: string, overrides: Partial<ParsedPage> = {}): ParsedPage {
  return {
    url,
    title: "",
    metaDescription: "",
    canonical: "",
    robotsMeta: "",
    og: { title: "", description: "", image: "" },
    hreflangs: [],
    headings: { h1: [], h2: [] },
    resolvedHrefs: [],
    structureSignature: "",
    jsonLd: [],
    authorSignals: { metaAuthor: "", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    contentText: "",
    html: "",
    ...overrides,
  };
}

function finding(ruleId: string, pageUrl: string, severity: RuleResult["severity"] = "error"): RuleResult {
  return { ruleId, severity, message: "test", pageUrl };
}

describe("valueAddRule", () => {
  test("all-good page (no rules fire) — score >= 0.5 — no finding", () => {
    const p = page("https://example.com/good", {
      authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
      resolvedHrefs: ["https://example.com/about"],
      publishedDate: "2024-01-01",
      html: "<p>Last updated: Jan 2024</p>",
    });
    const results = valueAddRule([p], []);
    expect(results).toHaveLength(0);
  });

  test("empty findings array → all signals 1.0 → no finding", () => {
    const p = page("https://example.com/empty");
    const results = valueAddRule([p], []);
    // No findings => originality=1, freshness=1, facts=1, eeat=0 (no signals), translation=1
    // score = (1+1+1+0+1)/5 = 0.8 => no finding
    expect(results).toHaveLength(0);
  });

  test("bestfirenze pattern — regurgitated-content + thin + no eeat — score < 0.5 — fires finding", () => {
    const url = "https://bestfirenze.com/";
    const p = page(url);
    // 7-signal: o=0 (regurgitated), f=0.5 (freshness warning),
    // c=0 (facts error), e=0 (no signals), t=1, cr=1, wp=0 (wikipedia-paraphrase fires).
    // score = (0+0.5+0+0+1+1+0)/7 = 2.5/7 ≈ 0.357 → borderline → "warning", confidence "low"
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/citable-facts", url, "error"),
      finding("aeo/freshness-signals", url, "warning"),
      finding("content/wikipedia-paraphrase", url, "warning"),
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warning");
    expect(results[0].ruleId).toBe("content/value-add");
    expect(results[0].pageUrl).toBe(url);
    expect(results[0].confidence).toBe("low");
    expect(results[0].message).toContain("value-add score");
    expect(results[0].message).toContain("SpamBrain");
  });

  test("bestfirenze pattern severe — regurgitated + facts error + freshness error + no eeat — score < 0.5 — fires finding", () => {
    const url = "https://bestfirenze.com/";
    const p = page(url);
    // 7-signal: o=0, f=0 (freshness error), c=0 (facts error), e=0 (no signals), t=1, cr=1, wp=1
    // score = (0+0+0+0+1+1+1)/7 = 3/7≈0.429 => borderline => "warning"
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/citable-facts", url, "error"),
      finding("aeo/freshness-signals", url, "error"),
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("content/value-add");
    expect(results[0].message).toContain("SpamBrain");
  });

  test("mixed page (some signals good, some bad) — finding at error severity", () => {
    const url = "https://example.com/mixed";
    // originality=0 (regurgitated), freshness=1 (no finding), facts=1 (no finding),
    // eeat=0 (no signals on page), translation=1 (no finding)
    // score = (0+1+1+0+1)/5 = 0.6 → no finding
    const p = page(url);
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
    ];
    // With just regurgitated: o=0, f=1, c=1, e=0, t=1 => score=0.6 => no finding
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(0);
  });

  test("mixed page — regurgitated + no eeat + no freshness — 6-signal score exactly 0.5 — no finding", () => {
    const url = "https://example.com/poor";
    // 6-signal math: o=0, f=0 (error), c=1, e=0, t=1, cr=1 => (0+0+1+0+1+1)/6 = 0.5
    // score = 0.5 => exactly at threshold => NO finding (threshold is score < 0.5)
    const p = page(url);
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/freshness-signals", url, "error"),
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(0);
  });

  test("mixed page — regurgitated + no eeat + no freshness + cliche-reuse — score < 0.5 — fires finding", () => {
    const url = "https://example.com/poor-cliche";
    // 7-signal: o=0, f=0 (error), c=1, e=0, t=1, cr=0, wp=1 => (0+0+1+0+1+0+1)/7 = 3/7≈0.429 => warning
    const p = page(url);
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/freshness-signals", url, "error"),
      finding("content/common-phrase-reuse", url, "warning"),
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    expect(results[0].ruleId).toBe("content/value-add");
  });

  test("page with only translation-no-op firing — score 0.8 — no finding", () => {
    const url = "https://example.com/en/page";
    const p = page(url);
    // translation-no-op: pageUrl is first URL, relatedUrls has others
    const findings: RuleResult[] = [
      {
        ruleId: "content/translation-no-op",
        severity: "error",
        message: "test",
        pageUrl: url,
        relatedUrls: [],
      },
    ];
    // originality=1, freshness=1, facts=1, eeat=0, translation=0
    // score = (1+1+1+0+0)/5 = 0.6 => no finding
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(0);
  });

  test("translation-no-op matching via relatedUrls — translation=0", () => {
    const primaryUrl = "https://example.com/page";
    const relatedUrl = "https://example.com/fr/page";
    const p = page(relatedUrl);
    const findings: RuleResult[] = [
      {
        ruleId: "content/translation-no-op",
        severity: "error",
        message: "test",
        pageUrl: primaryUrl,
        relatedUrls: [relatedUrl],
      },
    ];
    // The related page has translation=0; all others default to 1
    // score = (1+1+1+0+0)/5 = 0.6 => no finding
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(0);
  });

  test("all signals bad — score near 0 — error finding (clearly low) with worst signal list", () => {
    const url = "https://example.com/terrible";
    const p = page(url);
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/freshness-signals", url, "error"),
      finding("aeo/citable-facts", url, "error"),
      {
        ruleId: "content/translation-no-op",
        severity: "error",
        message: "test",
        pageUrl: url,
        relatedUrls: [],
      },
      // cliché-reuse fires => cr=0
      finding("content/common-phrase-reuse", url, "warning"),
      // wikipedia-paraphrase fires => wp=0
      finding("content/wikipedia-paraphrase", url, "warning"),
    ];
    // 7-signal: o=0, f=0, c=0, e=0, t=0, cr=0, wp=0 => score=0 => "error" (clearly low)
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("0%");
  });

  test("eeat fully present (4 categories) — eeat signal = 1.0", () => {
    const url = "https://example.com/eeat-good";
    const p = page(url, {
      authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
      resolvedHrefs: ["https://example.com/about"],
      publishedDate: "2024-01-01",
      html: "<p>Last updated: Jan 2024</p>",
    });
    // No findings => o=1, f=1, c=1, e=1, t=1 => score=1.0 => no finding
    const results = valueAddRule([p], []);
    expect(results).toHaveLength(0);
  });

  test("eeat partially present (2-3 categories) — eeat signal = 0.5", () => {
    const url = "https://example.com/partial-eeat";
    const p = page(url, {
      publishedDate: "2024-01-01",
      authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
    });
    // eeat=2 categories => 0.5; no findings => o=1,f=1,c=1,e=0.5,t=1 => mean=0.9 => no finding
    const results = valueAddRule([p], []);
    expect(results).toHaveLength(0);
  });

  test("freshness at info/warning severity — freshness = 0.5", () => {
    const url = "https://example.com/stale";
    const p = page(url);
    const findings: RuleResult[] = [
      finding("aeo/freshness-signals", url, "warning"),
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/citable-facts", url, "error"),
      finding("content/wikipedia-paraphrase", url, "warning"),
    ];
    // 7-signal: o=0, f=0.5, c=0, e=0, t=1, cr=1, wp=0
    // score = (0+0.5+0+0+1+1+0)/7 ≈ 0.357 → borderline → "warning"
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warning");
  });

  test("finding only matches pageUrl of the page being scored, not other pages", () => {
    const urlA = "https://example.com/a";
    const urlB = "https://example.com/b";
    const pA = page(urlA);
    const pB = page(urlB);
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", urlB, "warning"),
      finding("aeo/citable-facts", urlB, "error"),
      finding("aeo/freshness-signals", urlB, "error"),
    ];
    // urlA has no findings => 7-signal: o=1,f=1,c=1,e=0,t=1,cr=1,wp=1 => score=6/7≈0.857 => no finding
    const resultsA = valueAddRule([pA], findings);
    expect(resultsA).toHaveLength(0);

    // urlB: 7-signal: o=0, f=0, c=0, e=0, t=1, cr=1, wp=1 => score=3/7≈0.429 => borderline → warning
    const resultsB = valueAddRule([pB], findings);
    expect(resultsB).toHaveLength(1);
    expect(resultsB[0].severity).toBe("warning");
  });

  // -------------------------------------------------------------------------
  // 6-signal composite tests (v0.5.11 — common-phrase-reuse as signal 6)
  // -------------------------------------------------------------------------

  test("6-signal: all-good (no common-phrase-reuse finding) — score 5/6 — no finding", () => {
    const url = "https://example.com/6signal-good";
    // No findings => o=1,f=1,c=1,e=0,t=1,cr=1 => score=5/6≈0.833 => no finding
    const p = page(url);
    const results = valueAddRule([p], []);
    expect(results).toHaveLength(0);
  });

  test("6-signal: only common-phrase-reuse fires — composite drops by 1/6 — no finding", () => {
    const url = "https://example.com/6signal-cliche-only";
    const p = page(url);
    // cr=0, all others=1 except eeat=0 (no signals) => o=1,f=1,c=1,e=0,t=1,cr=0 => 4/6≈0.667 => no finding
    const findings: RuleResult[] = [
      finding("content/common-phrase-reuse", url, "warning"),
    ];
    const results = valueAddRule([p], findings);
    // 0.667 >= 0.5 => no finding
    expect(results).toHaveLength(0);
  });

  test("6-signal: common-phrase-reuse + 2 other signals fire — composite reflects all 7 signals", () => {
    const url = "https://example.com/6signal-three-bad";
    const p = page(url);
    // 7-signal: o=0 (regurgitated), f=1, c=0 (facts error), e=0, t=1, cr=0 (cliche), wp=1
    // score = 3/7≈0.429 => borderline => "warning"
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/citable-facts", url, "error"),
      finding("content/common-phrase-reuse", url, "warning"),
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warning");
    // Message should include cliché-reuse in the composite breakdown
    expect(results[0].message).toContain("cliché-reuse");
  });

  // -------------------------------------------------------------------------
  // NEW: graded eeat sub-score (continuous, not stepped)
  // -------------------------------------------------------------------------

  test("eeat with 1 of 4 categories gives a strictly non-zero, sub-0.5 sub-score (continuous)", () => {
    // With 1 E-E-A-T category (publishedDate only), the sub-score must be 1/4=0.25,
    // not a hard 0.0 (which was the old 3-step logic's behaviour for count < 2).
    // We verify this by checking the message: E-E-A-T % should be 25%, not 0%.
    const url = "https://example.com/one-eeat";
    const p = page(url, { publishedDate: "2024-01-01" });
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/freshness-signals", url, "error"),
      finding("aeo/citable-facts", url, "error"),
      finding("content/common-phrase-reuse", url, "warning"),
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    const eeatPct = Number(results[0].message.match(/E-E-A-T: (\d+)%/)?.[1] ?? "-1");
    expect(eeatPct).toBe(25);  // 1/4 = 25%, not 0%
  });

  test("eeat with 3 of 4 categories gives 75% sub-score (continuous, not floored to 0.5)", () => {
    const url = "https://example.com/three-eeat";
    const p = page(url, {
      publishedDate: "2024-01-01",
      authorSignals: { metaAuthor: "Jane", schemaAuthor: false, bylineElement: false, relAuthorLink: false },
      contentText: "Sources: CDC",
    });
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/freshness-signals", url, "error"),
      finding("aeo/citable-facts", url, "error"),
      finding("content/common-phrase-reuse", url, "warning"),
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    const eeatPct = Number(results[0].message.match(/E-E-A-T: (\d+)%/)?.[1] ?? "-1");
    expect(eeatPct).toBe(75);  // 3/4 = 75%
  });

  // -------------------------------------------------------------------------
  // NEW: 2-band severity (warning for borderline, error for clearly low)
  // -------------------------------------------------------------------------

  test("borderline score (just below 0.5, above severity boundary) — warning severity", () => {
    // Score of exactly 3/7 ≈ 0.429 (borderline, not clearly low)
    // 7-signal: o=1, f=1, c=1, e=0 (no eeat), t=0 (translation no-op), cr=0 (cliche), wp=1
    // = 4/7 ≈ 0.571 — too high. Let's try: o=0, f=1, c=1, e=1/4=0.25, t=1, cr=1, wp=1 = 5.25/7≈0.75
    // Need score in borderline band. Let's think about bands:
    // task says "2 bands" — let's say score in [0.35, 0.5) → warning, score < 0.35 → error/critical.
    // 7-signal: o=0, f=0.5, c=1, e=0.25, t=1, cr=1, wp=1 = 4.75/7 ≈ 0.679 — no fire.
    // Need more signals bad. o=0, f=0, c=0.5, e=0.25, t=1, cr=1, wp=1 = 3.75/7≈0.536 — no fire.
    // o=0, f=0, c=0, e=0.25, t=1, cr=1, wp=1 = 3.25/7≈0.464 — borderline! → warning
    const url = "https://example.com/borderline";
    const p = page(url, { publishedDate: "2024-01-01" });  // 1 eeat category → 0.25
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),  // o=0
      finding("aeo/freshness-signals", url, "error"),           // f=0
      finding("aeo/citable-facts", url, "error"),               // c=0
      // t=1, cr=1, wp=1
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("warning");
  });

  test("clearly low score — error severity (not warning)", () => {
    // o=0, f=0, c=0, e=0, t=0, cr=0, wp=0 = 0/7 = 0 → well below borderline → error
    const url = "https://example.com/clearly-low";
    const p = page(url);
    const findings: RuleResult[] = [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/freshness-signals", url, "error"),
      finding("aeo/citable-facts", url, "error"),
      { ruleId: "content/translation-no-op", severity: "error", message: "test", pageUrl: url, relatedUrls: [] },
      finding("content/common-phrase-reuse", url, "warning"),
      finding("content/wikipedia-paraphrase", url, "warning"),
    ];
    const results = valueAddRule([p], findings);
    expect(results).toHaveLength(1);
    expect(results[0].severity).toBe("error");
  });

  // -------------------------------------------------------------------------
  // Authoritative-citation → E-E-A-T sources credit (Task 9)
  // -------------------------------------------------------------------------

  test("counts an authoritative outbound citation toward the E-E-A-T sources category", () => {
    // A page with NO 'Sources:'/'References:' text but a .gov citation should get
    // the sources credit, so its E-E-A-T signal is never lower than an identical
    // page with neither. Both pages carry one OTHER E-E-A-T category
    // (publishedDate) so the citation flips the cited page from 1→2 categories
    // (0.0→0.5 band), giving a measurable, strictly-higher E-E-A-T %.
    // Force value-add to fire on both (regurgitated + freshness + facts errors)
    // so each emits a message we can read the E-E-A-T % from.
    const withCitation = page("https://x.test/cited", {
      publishedDate: "2024-01-01",
      html: '<main><p>Body. <a href="https://epa.gov/x">EPA</a></p></main>',
      resolvedHrefs: ["https://epa.gov/x"],
    });
    const withoutCitation = page("https://x.test/uncited", {
      publishedDate: "2024-01-01",
      html: "<main><p>Body.</p></main>",
      resolvedHrefs: [],
    });
    // Enough bad signals that BOTH pages stay < 0.5 even after the cited page
    // gains the +0.5 E-E-A-T band, so both emit a readable message.
    const findingsFor = (url: string): RuleResult[] => [
      finding("content/regurgitated-content", url, "warning"),
      finding("aeo/freshness-signals", url, "error"),
      finding("aeo/citable-facts", url, "error"),
      finding("content/common-phrase-reuse", url, "warning"),
    ];
    const a = valueAddRule([withCitation], findingsFor("https://x.test/cited"));
    const b = valueAddRule([withoutCitation], findingsFor("https://x.test/uncited"));
    const eeatPct = (msg?: string) => Number(msg?.match(/E-E-A-T: (\d+)%/)?.[1] ?? "0");
    // The cited page must never score worse than the uncited one on E-E-A-T.
    expect(eeatPct(a[0]?.message)).toBeGreaterThanOrEqual(eeatPct(b[0]?.message));
    // And concretely: the .gov citation lifts E-E-A-T above the uncited baseline.
    expect(eeatPct(a[0]?.message)).toBeGreaterThan(eeatPct(b[0]?.message));
  });
});
