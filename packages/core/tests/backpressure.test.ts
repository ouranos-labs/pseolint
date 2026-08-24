import { describe, expect, it } from "vitest";
import {
  BackpressureMonitor,
  OriginDegradedError,
} from "../src/backpressure.js";
import type { FetchObservation } from "../src/fetch-observer.js";

function obs(partial: Partial<FetchObservation> = {}): FetchObservation {
  return {
    url: "https://example.com/",
    status: 200,
    durationMs: 100,
    fromCache: false,
    revalidated: false,
    startedAt: 0,
    ...partial,
  };
}

describe("BackpressureMonitor", () => {
  it("never trips during the warmup window", () => {
    // First 10 fetches establish the baseline: no aborts even if slow.
    const m = new BackpressureMonitor({ warmupSize: 10, absoluteP95Ms: 3000, baselineMultiplier: 2, errorRatioThreshold: 0.1 });
    for (let i = 0; i < 10; i++) {
      const decision = m.record(obs({ durationMs: 5000, status: 500 }));
      expect(decision.shouldAbort).toBe(false);
    }
  });

  it("trips when post-warmup p95 exceeds baseline × multiplier", () => {
    const m = new BackpressureMonitor({ warmupSize: 5, absoluteP95Ms: 999_999, baselineMultiplier: 2, errorRatioThreshold: 1 });
    // Warmup: p95 ~ 200ms
    for (let i = 0; i < 5; i++) m.record(obs({ durationMs: 200 }));
    // Post-warmup: slow fetches. After enough of them the rolling p95 > 400ms.
    let tripped = false;
    for (let i = 0; i < 20; i++) {
      const d = m.record(obs({ durationMs: 500 }));
      if (d.shouldAbort) { tripped = true; break; }
    }
    expect(tripped).toBe(true);
  });

  it("trips on absolute p95 cap even when baseline was also slow", () => {
    const m = new BackpressureMonitor({ warmupSize: 5, absoluteP95Ms: 3000, baselineMultiplier: 999, errorRatioThreshold: 1 });
    for (let i = 0; i < 5; i++) m.record(obs({ durationMs: 1500 })); // baseline
    let tripped = false;
    for (let i = 0; i < 20; i++) {
      const d = m.record(obs({ durationMs: 4000 }));
      if (d.shouldAbort) { tripped = true; break; }
    }
    expect(tripped).toBe(true);
  });

  it("trips when 5xx ratio exceeds threshold post-warmup", () => {
    // 2026-05-03: comparison is strict `>` (was `>=`) so the test data must
    // genuinely exceed the threshold, not land on it. 4 of 15 = 26.7% > 20%.
    const m = new BackpressureMonitor({ warmupSize: 5, absoluteP95Ms: 999_999, baselineMultiplier: 999, errorRatioThreshold: 0.2 });
    for (let i = 0; i < 5; i++) m.record(obs({ status: 200 }));
    for (let i = 0; i < 6; i++) m.record(obs({ status: 200 }));
    m.record(obs({ status: 502 }));
    m.record(obs({ status: 503 }));
    m.record(obs({ status: 500 }));
    const decision = m.record(obs({ status: 500 }));
    expect(decision.shouldAbort).toBe(true);
    expect(decision.reason).toMatch(/5xx|error/i);
  });

  it("does NOT trip when 5xx ratio equals threshold exactly (regression for prod bug)", () => {
    // 2026-05-03 production fix: the old `>=` comparison aborted at the EXACT
    // threshold. 3 of 15 = 0.2 exactly. With strict `>`, this should NOT trip
    //: pseolint.dev was aborting every audit because the engine read
    // "5xx rate 10% exceeds threshold 10%" while not actually exceeding.
    const m = new BackpressureMonitor({ warmupSize: 5, absoluteP95Ms: 999_999, baselineMultiplier: 999, errorRatioThreshold: 0.2 });
    for (let i = 0; i < 5; i++) m.record(obs({ status: 200 }));
    for (let i = 0; i < 7; i++) m.record(obs({ status: 200 }));
    m.record(obs({ status: 502 }));
    m.record(obs({ status: 503 }));
    const decision = m.record(obs({ status: 500 }));
    expect(decision.shouldAbort).toBe(false);
  });

  it("ignores pure cache hits (they're not origin load)", () => {
    const m = new BackpressureMonitor({ warmupSize: 3, absoluteP95Ms: 3000, baselineMultiplier: 2, errorRatioThreshold: 0.1 });
    // All cache hits regardless of recorded durationMs: monitor should never trip.
    for (let i = 0; i < 100; i++) {
      const d = m.record(obs({ fromCache: true, durationMs: 10_000, status: 500 }));
      expect(d.shouldAbort).toBe(false);
    }
  });

  it("emits a diagnostic reason string when tripping", () => {
    const m = new BackpressureMonitor({ warmupSize: 3, absoluteP95Ms: 1000, baselineMultiplier: 999, errorRatioThreshold: 1 });
    for (let i = 0; i < 3; i++) m.record(obs({ durationMs: 100 }));
    let decision;
    for (let i = 0; i < 20; i++) {
      decision = m.record(obs({ durationMs: 2000 }));
      if (decision.shouldAbort) break;
    }
    expect(decision?.shouldAbort).toBe(true);
    expect(decision?.reason).toMatch(/p95/i);
    expect(decision?.reason).toMatch(/2000|ms/i);
  });
});

describe("OriginDegradedError", () => {
  it("exposes the diagnostic fields", () => {
    const err = new OriginDegradedError("p95 3200ms > cap 3000ms", {
      p95Ms: 3200,
      baselineP95Ms: 800,
      errorRatio: 0.05,
      liveFetchCount: 42,
    });
    expect(err.message).toContain("p95");
    expect(err.diagnostics.p95Ms).toBe(3200);
    expect(err.name).toBe("OriginDegradedError");
  });
});
