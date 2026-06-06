import { describe, it, expect } from "vitest";
import {
  aggregateGrowthRows,
  growthIndexationSummary,
  type GrowthMetricRow,
} from "@/lib/growth-metrics";
import type { GscPageQueryRow } from "@/lib/gsc";

const PREFIXES = ["/symptoms", "/rules", "/tools"];

function row(url: string, query: string, clicks: number, impressions: number, position: number): GscPageQueryRow {
  return { url, query, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position };
}

describe("aggregateGrowthRows", () => {
  it("drops URLs outside the growth prefixes", () => {
    const rows = [
      row("https://pseolint.dev/pricing", "pricing", 5, 100, 3),
      row("https://pseolint.dev/symptoms/x", "x query", 2, 50, 4),
    ];
    const { pageRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES });
    expect(pageRows).toHaveLength(1);
    expect(pageRows[0].url).toBe("https://pseolint.dev/symptoms/x");
  });

  it("emits a page-level row (query='') summing impressions/clicks with impression-weighted position", () => {
    const rows = [
      row("https://pseolint.dev/symptoms/x", "q1", 1, 100, 2), // weight 100
      row("https://pseolint.dev/symptoms/x", "q2", 3, 300, 6), // weight 300
    ];
    const { pageRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES });
    expect(pageRows).toHaveLength(1);
    const p = pageRows[0];
    expect(p.query).toBe("");
    expect(p.impressions).toBe(400);
    expect(p.clicks).toBe(4);
    // weighted avg position = (2*100 + 6*300)/400 = 5
    expect(p.positionAvg).toBeCloseTo(5, 5);
    // ctr = 4/400 = 0.01
    expect(p.ctrAvg).toBeCloseTo(0.01, 5);
  });

  it("returns null positionAvg/ctrAvg when impressions are zero", () => {
    const rows = [row("https://pseolint.dev/rules/y", "q", 0, 0, 0)];
    const { pageRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES });
    expect(pageRows[0].positionAvg).toBeNull();
    expect(pageRows[0].ctrAvg).toBeNull();
  });

  it("keeps only the top-N page+query rows per page by impressions", () => {
    const rows = Array.from({ length: 15 }, (_, i) =>
      row("https://pseolint.dev/tools/z", `q${i}`, 1, (i + 1) * 10, 5),
    );
    const { pageQueryRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES, topQueriesPerPage: 10 });
    const forPage = pageQueryRows.filter((r) => r.url === "https://pseolint.dev/tools/z");
    expect(forPage).toHaveLength(10);
    // highest-impression query (q14 → 150) is kept; lowest (q0 → 10) is dropped.
    expect(forPage.some((r) => r.query === "q14")).toBe(true);
    expect(forPage.some((r) => r.query === "q0")).toBe(false);
  });

  it("skips unparseable URLs without throwing", () => {
    const rows = [row("not a url", "q", 1, 10, 3)];
    const { pageRows, pageQueryRows } = aggregateGrowthRows(rows, { growthPrefixes: PREFIXES });
    expect(pageRows).toHaveLength(0);
    expect(pageQueryRows).toHaveLength(0);
  });

  it("handles empty input", () => {
    const out = aggregateGrowthRows([], { growthPrefixes: PREFIXES });
    expect(out.pageRows).toEqual([]);
    expect(out.pageQueryRows).toEqual([]);
  });
});

describe("growthIndexationSummary", () => {
  const pageRows: GrowthMetricRow[] = [
    { url: "https://pseolint.dev/symptoms/a", query: "", impressions: 50, clicks: 2, positionAvg: 4, ctrAvg: 0.04 },
    { url: "https://pseolint.dev/symptoms/b", query: "", impressions: 0, clicks: 0, positionAvg: null, ctrAvg: null },
  ];

  it("counts published URLs that have impressions", () => {
    const published = ["/symptoms/a", "/symptoms/b", "/symptoms/c"];
    const s = growthIndexationSummary(published, pageRows);
    expect(s.published).toBe(3);
    expect(s.withImpressions).toBe(1); // only /symptoms/a has impressions>0
    expect(s.indexationRatePct).toBe(33); // round(1/3*100)
  });

  it("guards against zero published URLs", () => {
    const s = growthIndexationSummary([], pageRows);
    expect(s.indexationRatePct).toBe(0);
  });
});
