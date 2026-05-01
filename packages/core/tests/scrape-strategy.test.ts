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

  it("refetches when prior findings are non-empty (reason: recheck)", () => {
    const plan = planScrapeStrategy({
      candidateUrls: ["https://example.com/a"],
      priorState: baseState({
        "https://example.com/a": baseEntry({
          findings: [{ id: "f1", ruleId: "r", severity: "warn", confidence: "high", message: "m" }],
          findingIds: ["f1"],
        }),
      }),
      sitemapLastmodByUrl: new Map(),
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
});
