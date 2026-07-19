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
        if ("origin" in body) return res({}, 404);
        return res(record({ lcp: 5200, cls: "0.31", inp: 640 }));
      },
    });
    expect(out.get("https://x.com/a")).toEqual({ lcp: 5200, cls: 0.31, inp: 640, source: "url" });
  });

  it("falls back to origin-level data when the URL has none, and caches the origin", async () => {
    let originCalls = 0;
    const out = await fetchCruxFieldVitals(["https://x.com/a", "https://x.com/b"], "KEY", {
      fetchFn: async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if ("origin" in body) { originCalls += 1; return res(record({ lcp: 3000, cls: "0.05", inp: 150 })); }
        return res({}, 404);
      },
    });
    expect(out.get("https://x.com/a")).toEqual({ lcp: 3000, cls: 0.05, inp: 150, source: "origin" });
    expect(out.get("https://x.com/b")?.source).toBe("origin");
    expect(originCalls).toBe(1); // one origin lookup shared across both pages
  });

  it("caps per-URL lookups and reports the skipped count", async () => {
    let capped = -1;
    const urls = ["https://x.com/1", "https://x.com/2", "https://x.com/3"];
    let urlLookups = 0;
    await fetchCruxFieldVitals(urls, "KEY", {
      maxUrlLookups: 1,
      onCapped: (n) => { capped = n; },
      fetchFn: async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if ("origin" in body) return res(record({ lcp: 3000, cls: "0.05", inp: 150 }));
        urlLookups += 1;
        return res(record({ lcp: 5000, cls: "0.3", inp: 600 }));
      },
    });
    expect(capped).toBe(2); // 2 of 3 URLs skipped for per-URL lookup
    expect(urlLookups).toBe(1); // only the first URL was queried per-URL
  });

  it("treats maxUrlLookups=0 as unlimited (all URLs queried per-URL)", async () => {
    let capped = -1;
    let urlLookups = 0;
    const urls = ["https://x.com/1", "https://x.com/2", "https://x.com/3"];
    await fetchCruxFieldVitals(urls, "KEY", {
      maxUrlLookups: 0,
      onCapped: (n) => { capped = n; },
      fetchFn: async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if ("origin" in body) return res({}, 404);
        urlLookups += 1;
        return res(record({ lcp: 2000, cls: "0.02", inp: 100 }));
      },
    });
    expect(urlLookups).toBe(3);
    expect(capped).toBe(-1); // onCapped never fired
  });

  it("sends form_factor when a specific device is requested", async () => {
    let sawFormFactor: string | undefined;
    await fetchCruxFieldVitals(["https://x.com/a"], "KEY", {
      formFactor: "phone",
      fetchFn: async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if ("url" in body) sawFormFactor = body.form_factor;
        return res(record({ lcp: 2000, cls: "0.02", inp: 100 }));
      },
    });
    expect(sawFormFactor).toBe("PHONE");
  });

  it("signals operational errors (429) but not 404, and never throws", async () => {
    let statuses: number[] | undefined;
    const out = await fetchCruxFieldVitals(["https://x.com/a"], "KEY", {
      onHttpError: (s) => { statuses = s; },
      fetchFn: async (_u, init) => {
        const body = JSON.parse((init?.body as string) ?? "{}");
        if ("origin" in body) return res({}, 404); // no data — expected, not an error
        return res({ error: "rate limited" }, 429);
      },
    });
    expect(out.size).toBe(0);
    expect(statuses).toEqual([429]);
  });

  it("treats HTTP 500 as no data and signals it", async () => {
    let statuses: number[] | undefined;
    const out = await fetchCruxFieldVitals(["https://x.com/a"], "KEY", {
      onHttpError: (s) => { statuses = s; },
      fetchFn: async () => res({}, 500),
    });
    expect(out.size).toBe(0);
    expect(statuses).toEqual([500]);
  });
});
