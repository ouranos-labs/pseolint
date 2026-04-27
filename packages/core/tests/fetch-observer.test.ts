import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  type FetchObservation,
  type ReadinessVerdict,
} from "../src/fetch-observer.js";

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

describe("computeReadiness", () => {
  it("returns null when no origin (non-cached) observations exist", () => {
    // With zero live fetches we can't say anything about the origin.
    expect(computeReadiness([])).toBeNull();
    expect(
      computeReadiness([obs({ fromCache: true }), obs({ fromCache: true })]),
    ).toBeNull();
  });

  it("excludes pure cache hits from latency stats (they don't reflect origin)", () => {
    const live = [obs({ durationMs: 200 }), obs({ durationMs: 400 }), obs({ durationMs: 600 })];
    const withCache = [...live, obs({ fromCache: true, durationMs: 5 })];
    const a = computeReadiness(live)!;
    const b = computeReadiness(withCache)!;
    expect(a.medianMs).toBe(b.medianMs);
    expect(a.p95Ms).toBe(b.p95Ms);
  });

  it("counts revalidation (304) as cache-assisted for the ratio", () => {
    const result = computeReadiness([
      obs({ fromCache: false, revalidated: true }),
      obs({ fromCache: true }),
      obs({ fromCache: false }),
      obs({ fromCache: false }),
    ])!;
    // 2 of 4 fetches benefited from cache (one 304 + one pure hit) = 0.5.
    expect(result.cacheAssistRatio).toBe(0.5);
  });

  it("computes median and p95 over origin fetches", () => {
    const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const result = computeReadiness(durations.map((d) => obs({ durationMs: d })))!;
    expect(result.medianMs).toBe(500); // 50th percentile of 10 samples
    expect(result.p95Ms).toBe(1000);   // 95th percentile
  });

  it("counts 5xx responses", () => {
    const result = computeReadiness([
      obs({ status: 200 }),
      obs({ status: 500 }),
      obs({ status: 503 }),
      obs({ status: 404 }), // not 5xx
    ])!;
    expect(result.serverErrorCount).toBe(2);
    expect(result.serverErrorRatio).toBeCloseTo(0.5, 2); // 2/4 live fetches
  });

  it("verdict 'ready' when p95 fast, no 5xx, some cache help", () => {
    const result = computeReadiness([
      obs({ durationMs: 100, fromCache: false }),
      obs({ durationMs: 150, fromCache: false }),
      obs({ durationMs: 180, fromCache: false }),
      obs({ durationMs: 200, revalidated: true }),
    ])!;
    const verdict: ReadinessVerdict = result.verdict;
    expect(verdict).toBe("ready");
  });

  it("verdict 'concerning' when p95 slow but no errors", () => {
    const many = Array.from({ length: 20 }, () => obs({ durationMs: 1500 }));
    const result = computeReadiness(many)!;
    expect(result.verdict).toBe("concerning");
  });

  it("verdict 'not-ready' when p95 > 3s OR 5xx rate > 10%", () => {
    const slow = Array.from({ length: 20 }, () => obs({ durationMs: 4000 }));
    expect(computeReadiness(slow)!.verdict).toBe("not-ready");

    const errorful = [
      ...Array.from({ length: 8 }, () => obs({ status: 200, durationMs: 200 })),
      ...Array.from({ length: 2 }, () => obs({ status: 502, durationMs: 200 })),
    ];
    expect(computeReadiness(errorful)!.verdict).toBe("not-ready");
  });
});
