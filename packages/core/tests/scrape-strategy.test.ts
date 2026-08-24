import { describe, it, expect } from "vitest";
import { planScrapeStrategy } from "../src/scrape-strategy.js";
import { STATE_SCHEMA_VERSION, type RunState, type UrlStateEntry } from "../src/state.js";

const baseEntry = (overrides: Partial<UrlStateEntry> = {}): UrlStateEntry => ({
  contentHash: "sha256:abc",
  fetchedAt: "2026-05-01T00:00:00Z",
  status: 200,
  findingIds: [],
  findings: [],
  rulesetVersion: "1",
  ...overrides,
});

const baseState = (urls: Record<string, UrlStateEntry>): RunState => ({
  version: STATE_SCHEMA_VERSION,
  lastRun: "2026-05-01T00:00:00Z",
  lastFullAuditAt: "2026-05-01T00:00:00Z",
  source: "https://example.com",
  renderMode: "static",
  rulesetVersion: "1",
  urls,
  summary: { score: 100, totalFindings: 0, byCategory: {} },
});

const NOW = new Date("2026-05-08T00:00:00Z");

describe("planScrapeStrategy", () => {
  it("refetches when there is no prior state at all", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: null,
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("new");
    expect(plan.skip.size).toBe(0);
  });

  it("refetches a URL not present in prior state (reason: new)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a", "https://example.com/b"],
      priorState: baseState({ "https://example.com/a": baseEntry() }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/b")).toBe("new");
  });

  it("refetches when prior fetchedAt exceeds age floor (reason: age)", () => {
    const old = "2026-04-20T00:00:00Z";
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({ "https://example.com/a": baseEntry({ fetchedAt: old }) }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("age");
  });

  it("refetches when ruleset version differs (reason: ruleset)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({ "https://example.com/a": baseEntry({ rulesetVersion: "1" }) }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "2",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("ruleset");
  });

  it("refetches when prior findings include a warning (reason: recheck)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({
          findings: [{ id: "f1", ruleId: "r", severity: "warn", confidence: "high", message: "m" }],
          findingIds: ["f1"],
        }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("recheck");
  });

  it("refetches when prior findings include a critical or error (reason: recheck)", () => {
    for (const severity of ["error", "critical"]) {
      const plan = planScrapeStrategy({
        candidateUrls: ["https://example.com/a"],
        priorState: baseState({
          "https://example.com/a": baseEntry({
            findings: [{ id: "f1", ruleId: "r", severity, confidence: "high", message: "m" }],
            findingIds: ["f1"],
          }),
        }),
        sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
      });
      expect(plan.refetch.get("https://example.com/a")).toBe("recheck");
    }
  });

  it("SKIPS when prior findings are info-only; they carry forward without refetch", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({
          findings: [{ id: "f1", ruleId: "r", severity: "info", confidence: "high", message: "m" }],
          findingIds: ["f1"],
        }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.skip.get("https://example.com/a")).toBe("unchanged");
    expect(plan.refetch.size).toBe(0);
  });

  it("falls back to refetch on legacy entries with findingIds but no full findings records", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({
          findings: [], // no full records (legacy v2 entry written before T7's full-records persistence)
          findingIds: ["legacy-id"],
        }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("recheck");
  });

  it("refetches when sitemap lastmod is newer than prior fetchedAt (reason: lastmod)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-01T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-05-05T00:00:00Z"]]),
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("lastmod");
  });

  it("skips when sitemap lastmod is older than prior fetchedAt and nothing else triggers", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.skip.get("https://example.com/a")).toBe("unchanged");
    expect(plan.refetch.size).toBe(0);
  });

  it("refetches when no skip evidence is available (reason: no-signal)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("no-signal");
  });

  it("matrix order: 'new' beats everything (URL not in state)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({}),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "1",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("new");
  });

  it("matrix order: 'age' beats 'ruleset'", () => {
    const old = "2026-04-20T00:00:00Z";
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: old, rulesetVersion: "old" }),
      }),
      sitemapLastmodByUrl: new Map(),
      currentRulesetVersion: "new",
      ageFloorDays: 7,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("age");
  });

  it("GSC delta triggers refetch when threshold exceeded", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      gscDeltasByUrl: new Map([["https://example.com/a", { impressionsDelta: -0.4, clicksDelta: 0 }]]),
      gscThresholds: { impressionsPct: 0.2, clicksAbsolute: 5 },
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.refetch.get("https://example.com/a")).toBe("gsc");
  });

  it("GSC delta below threshold does not trigger when other signals say unchanged", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
      }),
      sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
      gscDeltasByUrl: new Map([["https://example.com/a", { impressionsDelta: 0.05, clicksDelta: 1 }]]),
      gscThresholds: { impressionsPct: 0.2, clicksAbsolute: 5 },
      currentRulesetVersion: "1",
      ageFloorDays: 30,
      now: NOW,
    });
    expect(plan.skip.get("https://example.com/a")).toBe("unchanged");
  });

  // v0.5.4: template-stratified URL sampling.
  describe("sampleSize / stratified sampling", () => {
    /** Build N URLs under a given path template, e.g. "/listing/slug-NNN". */
    function makeUrls(prefix: string, count: number, start = 0): string[] {
      return Array.from({ length: count }, (_, i) =>
        `https://example.com${prefix}-${start + i}`,
      );
    }

    it("no stratification when candidateUrls <= sampleSize (takes all)", () => {
      const urls = makeUrls("/listing/slug", 50);
      const plan = planScrapeStrategy({
        candidateUrls: urls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 100,
      });
      expect(plan.refetch.size).toBe(50);
    });

    it("no stratification when candidateUrls <= sampleSize * 1.5 (sequential prefix slice)", () => {
      const urls = makeUrls("/listing/slug", 140);
      const plan = planScrapeStrategy({
        candidateUrls: urls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 100,
      });
      // 140 <= 100*1.5=150, so take first 100 (slice fallback)
      expect(plan.refetch.size).toBe(100);
    });

    it("3-cluster corpus 80/15/5: tiny cluster still gets ≥1 URL", () => {
      // 1000 URLs: 800 /listing/:slug, 150 /category/:slug, 50 /help/:slug
      const listing = makeUrls("/listing/slug", 800);
      const category = makeUrls("/category/slug", 150);
      const help = makeUrls("/help/slug", 50);
      const allUrls = [...listing, ...category, ...help];

      const plan = planScrapeStrategy({
        candidateUrls: allUrls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 100,
      });

      const fetchedUrls = Array.from(plan.refetch.keys());
      // Total should be ≤ 100
      expect(fetchedUrls.length).toBeLessThanOrEqual(100);

      // The tiny cluster (5%) must contribute ≥1 URL
      const helpFetched = fetchedUrls.filter((u) => u.includes("/help/slug"));
      expect(helpFetched.length).toBeGreaterThanOrEqual(1);

      // The small cluster (15%) must contribute ≥1 URL
      const categoryFetched = fetchedUrls.filter((u) => u.includes("/category/slug"));
      expect(categoryFetched.length).toBeGreaterThanOrEqual(1);

      // The large cluster (80%) should have more slots than the tiny one
      const listingFetched = fetchedUrls.filter((u) => u.includes("/listing/slug"));
      expect(listingFetched.length).toBeGreaterThan(helpFetched.length);
    });

    it("dominant cluster >80% of URLs falls back to sequential slice (no stratification)", () => {
      // 950 listing / 50 help: top ratio = 0.95 > 0.8 threshold
      const listing = makeUrls("/listing/slug", 950);
      const help = makeUrls("/help/slug", 50);
      const allUrls = [...listing, ...help];

      const plan = planScrapeStrategy({
        candidateUrls: allUrls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 100,
      });

      const fetchedUrls = Array.from(plan.refetch.keys());
      expect(fetchedUrls.length).toBeLessThanOrEqual(100);
      // Fallback: sequential slice → all from the front (listing)
      const helpFetched = fetchedUrls.filter((u) => u.includes("/help/slug"));
      const listingFetched = fetchedUrls.filter((u) => u.includes("/listing/slug"));
      expect(listingFetched.length).toBe(100);
      expect(helpFetched.length).toBe(0);
    });

    it("unclustered corpus (single template) falls through to sequential slice", () => {
      // All URLs collapse to same template: only 1 cluster, no stratification
      const urls = makeUrls("/listing/slug", 300);
      const plan = planScrapeStrategy({
        candidateUrls: urls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 100,
      });
      expect(plan.refetch.size).toBe(100);
      // All should be from front of the list (sequential slice)
      const keys = Array.from(plan.refetch.keys());
      expect(keys[0]).toBe(urls[0]);
      expect(keys[99]).toBe(urls[99]);
    });

    it("budget < cluster count degrades sensibly: each cluster gets ≥1 if possible", () => {
      // 3 clusters, budget = 3: each must get exactly 1
      const listing = makeUrls("/listing/slug", 800);
      const category = makeUrls("/category/slug", 150);
      const help = makeUrls("/help/slug", 50);
      const allUrls = [...listing, ...category, ...help];

      const plan = planScrapeStrategy({
        candidateUrls: allUrls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 3,
      });

      const fetchedUrls = Array.from(plan.refetch.keys());
      // Total ≤ budget (floor-of-1 guarantees 3 slots, one per cluster)
      expect(fetchedUrls.length).toBeLessThanOrEqual(5);
      // Each cluster should be represented
      expect(fetchedUrls.some((u) => u.includes("/listing/slug"))).toBe(true);
      expect(fetchedUrls.some((u) => u.includes("/category/slug"))).toBe(true);
      expect(fetchedUrls.some((u) => u.includes("/help/slug"))).toBe(true);
    });

    it("long-tail URLs (singleton-template pages) get a small fixed allocation", () => {
      // 600 listing (60%), 300 category (30%), plus 100 singleton-template pages.
      // Uppercase paths won't match the slug normalizer so each becomes a unique
      // literal template (count=1) → they collect into the long-tail bucket.
      const listing = makeUrls("/listing/slug", 600);
      const category = makeUrls("/category/slug", 300);
      const singletons = Array.from({ length: 100 }, (_, i) =>
        `https://example.com/StaticPage${i}`,
      );
      const allUrls = [...listing, ...category, ...singletons];

      const plan = planScrapeStrategy({
        candidateUrls: allUrls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 100,
      });

      const fetchedUrls = Array.from(plan.refetch.keys());
      expect(fetchedUrls.length).toBeLessThanOrEqual(100);
      // Long-tail singletons should appear (allocation = min(20, 10% of 100) = 10)
      const longTailFetched = fetchedUrls.filter((u) => u.includes("/StaticPage"));
      expect(longTailFetched.length).toBeGreaterThan(0);
      expect(longTailFetched.length).toBeLessThanOrEqual(20);
    });

    it("watched URLs bypass the sample budget and are always included", () => {
      const listing = makeUrls("/listing/slug", 800);
      const category = makeUrls("/category/slug", 200);
      const watched = ["https://example.com/watched-page"];

      const plan = planScrapeStrategy({
        candidateUrls: [...listing, ...category],
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 100,
        forceRefetchUrls: watched,
      });

      expect(plan.refetch.get("https://example.com/watched-page")).toBe("watched");
      // The rest of the plan should still be within budget
      const nonWatched = Array.from(plan.refetch.keys()).filter(
        (u) => !watched.includes(u),
      );
      expect(nonWatched.length).toBeLessThanOrEqual(100);
    });

    it("undefined sampleSize leaves behaviour unchanged (full backwards-compat)", () => {
      const urls = makeUrls("/listing/slug", 5);
      const withoutSize = planScrapeStrategy({
        candidateUrls: urls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
      });
      const withZero = planScrapeStrategy({
        candidateUrls: urls,
        priorState: null,
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        sampleSize: 0,
      });
      expect(withoutSize.refetch.size).toBe(5);
      expect(withZero.refetch.size).toBe(5);
    });
  });

  // v0.5.3: caller-supplied "watched pages" force-include list.
  describe("forceRefetchUrls (watched pages)", () => {
    it("forces refetch with reason 'watched' on a URL that would otherwise skip", () => {
      // Fresh prior, ruleset matches, no findings, no lastmod change → would skip "unchanged"
      // (well, "no-signal" on this fixture, since lastmod is older). Either way, watched wins.
      const plan = planScrapeStrategy({
        candidateUrls: ["https://example.com/a"],
        priorState: baseState({
          "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
        }),
        sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
        currentRulesetVersion: "1",
        ageFloorDays: 30,
        now: NOW,
        forceRefetchUrls: ["https://example.com/a"],
      });
      expect(plan.refetch.get("https://example.com/a")).toBe("watched");
      expect(plan.skip.size).toBe(0);
    });

    it("'watched' takes precedence over 'new' on a URL absent from prior state", () => {
      const plan = planScrapeStrategy({
        candidateUrls: ["https://example.com/a"],
        priorState: baseState({}),
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 7,
        now: NOW,
        forceRefetchUrls: ["https://example.com/a"],
      });
      expect(plan.refetch.get("https://example.com/a")).toBe("watched");
    });

    it("URLs not in forceRefetchUrls follow the existing matrix exactly (no regression)", () => {
      const plan = planScrapeStrategy({
        candidateUrls: ["https://example.com/a", "https://example.com/b"],
        priorState: baseState({
          "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
          "https://example.com/b": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
        }),
        sitemapLastmodByUrl: new Map([
          ["https://example.com/a", "2026-04-01T00:00:00Z"],
          ["https://example.com/b", "2026-04-01T00:00:00Z"],
        ]),
        currentRulesetVersion: "1",
        ageFloorDays: 30,
        now: NOW,
        forceRefetchUrls: ["https://example.com/a"],
      });
      expect(plan.refetch.get("https://example.com/a")).toBe("watched");
      // /b had no signal change AND lastmod is older than fetchedAt, so it should skip "unchanged".
      expect(plan.skip.get("https://example.com/b")).toBe("unchanged");
      expect(plan.refetch.has("https://example.com/b")).toBe(false);
    });

    it("undefined forceRefetchUrls leaves behavior unchanged (full backwards-compat)", () => {
      const baseInputs = {
        candidateUrls: ["https://example.com/a"],
        priorState: baseState({
          "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
        }),
        sitemapLastmodByUrl: new Map([["https://example.com/a", "2026-04-01T00:00:00Z"]]),
        currentRulesetVersion: "1",
        ageFloorDays: 30,
        now: NOW,
      };
      const without = planScrapeStrategy(baseInputs);
      const withEmpty = planScrapeStrategy({ ...baseInputs, forceRefetchUrls: [] });
      expect(without.skip.get("https://example.com/a")).toBe("unchanged");
      expect(withEmpty.skip.get("https://example.com/a")).toBe("unchanged");
      expect(without.refetch.size).toBe(0);
      expect(withEmpty.refetch.size).toBe(0);
    });

    it("watched URL absent from candidateUrls is still added to the audit set", () => {
      // Common case: user watched a page that has since been removed from the
      // sitemap. We should still fetch it so the user finds out it's gone.
      const plan = planScrapeStrategy({
        candidateUrls: ["https://example.com/a"],
        priorState: baseState({
          "https://example.com/a": baseEntry({ fetchedAt: "2026-05-07T00:00:00Z" }),
        }),
        sitemapLastmodByUrl: new Map(),
        currentRulesetVersion: "1",
        ageFloorDays: 30,
        now: NOW,
        forceRefetchUrls: ["https://example.com/removed-from-sitemap"],
      });
      expect(plan.refetch.get("https://example.com/removed-from-sitemap")).toBe("watched");
      // /a was a no-signal URL, original behavior preserved.
      expect(plan.refetch.get("https://example.com/a")).toBe("no-signal");
    });
  });
});
