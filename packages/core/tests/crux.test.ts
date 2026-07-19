import { describe, it, expect } from "vitest";
import { fetchCruxFieldVitals } from "../src/crux.js";

function record(metrics: Record<string, number | string>) {
  const m: Record<string, unknown> = {};
  if ("lcp" in metrics) m.largest_contentful_paint = { percentiles: { p75: metrics.lcp } };
  if ("cls" in metrics) m.cumulative_layout_shift = { percentiles: { p75: metrics.cls } };
  if ("inp" in metrics) m.interaction_to_next_paint = { percentiles: { p75: metrics.inp } };
  return { record: { metrics: m } };
}

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("fetchCruxFieldVitals", () => {
  it("makes no calls without an API key", async () => {
    let called = false;
    const out = await fetchCruxFieldVitals(["https://x.com/a"], "", {
      fetchFn: async () => { called = true; return res({}); },
    });
    expect(called).toBe(false);
    expect(out.size).toBe(0);
  });

  it("parses per-URL field data incl. INP; CLS string coerces to number", async () => {
    const out = await fetchCruxFieldVitals(["https://x.com/a"], "KEY", {
      fetchFn: async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        // origin lookup returns nothing; url lookup returns data
        if ("origin" in body) return res({}, 404);
        return res(record({ lcp: 5200, cls: "0.31", inp: 640 }));
      },
    });
    const v = out.get("https://x.com/a");
    expect(v).toEqual({ lcp: 5200, cls: 0.31, inp: 640, source: "url" });
  });

  it("falls back to origin-level data when the URL has none, and caches the origin", async () => {
    let originCalls = 0;
    const out = await fetchCruxFieldVitals(["https://x.com/a", "https://x.com/b"], "KEY", {
      fetchFn: async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if ("origin" in body) { originCalls += 1; return res(record({ lcp: 3000, cls: "0.05", inp: 150 })); }
        return res({}, 404); // no per-URL data
      },
    });
    expect(out.get("https://x.com/a")).toEqual({ lcp: 3000, cls: 0.05, inp: 150, source: "origin" });
    expect(out.get("https://x.com/b")?.source).toBe("origin");
    expect(originCalls).toBe(1); // cached across both pages
  });

  it("caps per-URL lookups and reports the skipped count", async () => {
    let capped = -1;
    const urls = ["https://x.com/1", "https://x.com/2", "https://x.com/3"];
    await fetchCruxFieldVitals(urls, "KEY", {
      maxUrlLookups: 1,
      onCapped: (n) => { capped = n; },
      fetchFn: async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if ("origin" in body) return res(record({ lcp: 3000, cls: "0.05", inp: 150 }));
        return res(record({ lcp: 5000, cls: "0.3", inp: 600 }));
      },
    });
    expect(capped).toBe(2); // 2 of 3 URLs only got origin-level data
  });

  it("treats HTTP failure as no data (no throw)", async () => {
    const out = await fetchCruxFieldVitals(["https://x.com/a"], "KEY", {
      fetchFn: async () => res({}, 500),
    });
    expect(out.size).toBe(0);
  });
});
