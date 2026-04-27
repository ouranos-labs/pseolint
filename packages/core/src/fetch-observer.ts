/**
 * Fetch observation + origin-readiness aggregation.
 *
 * Every HTTP request during an audit emits a `FetchObservation` (url, status,
 * wall-clock duration, whether the cache served or revalidated it). These
 * observations feed two consumers:
 *
 *   1. `computeReadiness` — post-crawl aggregate (median / p95 / 5xx count /
 *      cache-assist ratio) surfaced as the `audit/origin-readiness` finding.
 *   2. `BackpressureMonitor` (backpressure.ts) — in-flight watchdog that aborts
 *      the audit if the origin degrades under concurrent load.
 *
 * Both consumers treat pure cache hits (`fromCache` with no revalidation)
 * as non-informative about the origin — latency stats should describe the
 * SERVER, not our local SSD.
 */

export interface FetchObservation {
  url: string;
  status: number;
  /** Wall-clock duration of the fetch in milliseconds. For revalidated cache
   *  entries this is the 304 round-trip; for uncached fetches it's the full
   *  TTFB + body read. */
  durationMs: number;
  /** True when the cache returned the body without contacting the origin. */
  fromCache: boolean;
  /** True when the cache made a conditional GET that returned 304 Not Modified.
   *  Counts as a cache-assist for the ratio but as a live origin call for
   *  latency purposes. */
  revalidated: boolean;
  /** `Date.now()` when the fetch began. Ordering, not wall-clock accuracy. */
  startedAt: number;
}

export type ReadinessVerdict = "ready" | "concerning" | "not-ready";

export interface ReadinessReport {
  /** Count of observations that actually went to the origin (not pure cache). */
  liveFetchCount: number;
  medianMs: number;
  p95Ms: number;
  /** 2xx/3xx count / liveFetchCount. Not meaningful — provided for callers. */
  successRatio: number;
  serverErrorCount: number;
  /** 5xx / liveFetchCount. */
  serverErrorRatio: number;
  /** (revalidated + fromCache) / total observations. How much the cache helped. */
  cacheAssistRatio: number;
  verdict: ReadinessVerdict;
}

export interface ReadinessThresholds {
  /** p95 at or above this → verdict 'not-ready' (absolute cap). Default 3000. */
  notReadyP95Ms?: number;
  /** p95 at or above this (but below notReadyP95Ms) → 'concerning'. Default 800. */
  concerningP95Ms?: number;
  /** 5xx/live ratio at or above this → 'not-ready' regardless of latency. Default 0.1. */
  notReadyErrorRatio?: number;
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  // Nearest-rank method (simple, deterministic for small samples).
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.max(0, Math.min(sortedAsc.length - 1, rank))];
}

/**
 * Aggregate a run's fetch observations into a readiness report. Returns `null`
 * when there's no origin data to speak to (zero fetches, or all pure cache
 * hits). Null is a signal to callers that the finding should be suppressed —
 * it's not a result worth displaying.
 */
export function computeReadiness(
  observations: readonly FetchObservation[],
  thresholds: ReadinessThresholds = {},
): ReadinessReport | null {
  const t = {
    notReadyP95Ms: thresholds.notReadyP95Ms ?? 3000,
    concerningP95Ms: thresholds.concerningP95Ms ?? 800,
    notReadyErrorRatio: thresholds.notReadyErrorRatio ?? 0.1,
  };

  // Live fetches = anything that actually spoke to the origin (revalidation
  // counts because the 304 round-trip is a real network call).
  const live = observations.filter((o) => !o.fromCache || o.revalidated);
  if (live.length === 0) return null;

  const durations = live.map((o) => o.durationMs).sort((a, b) => a - b);
  const medianMs = percentile(durations, 50);
  const p95Ms = percentile(durations, 95);

  const serverErrorCount = live.filter((o) => o.status >= 500 && o.status < 600).length;
  const successCount = live.filter((o) => o.status >= 200 && o.status < 400).length;
  const serverErrorRatio = serverErrorCount / live.length;
  const successRatio = successCount / live.length;

  const cacheAssistCount = observations.filter((o) => o.fromCache || o.revalidated).length;
  const cacheAssistRatio = observations.length === 0 ? 0 : cacheAssistCount / observations.length;

  let verdict: ReadinessVerdict;
  if (p95Ms >= t.notReadyP95Ms || serverErrorRatio >= t.notReadyErrorRatio) {
    verdict = "not-ready";
  } else if (p95Ms >= t.concerningP95Ms) {
    verdict = "concerning";
  } else {
    verdict = "ready";
  }

  return {
    liveFetchCount: live.length,
    medianMs,
    p95Ms,
    successRatio,
    serverErrorCount,
    serverErrorRatio,
    cacheAssistRatio,
    verdict,
  };
}

/**
 * A small collector so callers can hand the same object to the fetch pipeline
 * (as an onObservation callback) and to the readiness/backpressure consumers.
 */
export class FetchObserver {
  private readonly entries: FetchObservation[] = [];

  record(obs: FetchObservation): void {
    this.entries.push(obs);
  }

  getAll(): readonly FetchObservation[] {
    return this.entries;
  }

  snapshotLast(n: number): readonly FetchObservation[] {
    return this.entries.slice(Math.max(0, this.entries.length - n));
  }

  get size(): number {
    return this.entries.length;
  }
}
