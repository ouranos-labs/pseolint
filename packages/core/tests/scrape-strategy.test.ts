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

  it("SKIPS when prior findings are info-only — they carry forward without refetch", () => {
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

  // v0.5.3 — caller-supplied "watched pages" force-include list.
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
