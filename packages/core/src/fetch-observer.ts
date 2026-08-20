/**
 * Fetch observation + origin-readiness aggregation.
 *
 * Every HTTP request during an audit emits a `FetchObservation` (url, status,
 * wall-clock duration, whether the cache served or revalidated it). These
 * observations feed two consumers:
 *
 *   1. `computeReadiness`: post-crawl aggregate (median / p95 / 5xx count /
 *      cache-assist ratio) surfaced as the `audit/origin-readiness` finding.
 *   2. `BackpressureMonitor` (backpressure.ts): in-flight watchdog that aborts
 *      the audit if the origin degrades under concurrent load.
 *
 * Both consumers treat pure cache hits (`fromCache` with no revalidation)
 * as non-informative about the origin: latency stats should describe the
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
  /**
   * v0.4: lower-cased response headers. Populated when available so the
   * auditor can sniff framework markers (`x-powered-by`, `x-vite-*`, etc.)
   * without a separate probe fetch. Optional to keep memory bounded.
   */
  headers?: Record<string, string>;
}

export type ReadinessVerdict = "ready" | "concerning" | "not-ready";

export interface ReadinessReport {
  /** Count of observations that actually went to the origin (not pure cache). */
  liveFetchCount: number;
  medianMs: number;
  p95Ms: number;
  /** 2xx/3xx count / liveFetchCount. Not meaningful: provided for callers. */
  successRatio: number;
  serverErrorCount: number;
  /** 5xx / liveFetchCount. */
  serverErrorRatio: number;
  /** (revalidated + fromCache) / total observations. How much the cache helped. */
  cacheAssistRatio: number;
  verdict: ReadinessVerdict;
  /**
   * v0.4: which dev-server framework was detected on the source response, if any.
   * When set, readiness thresholds are softened (p95 cap raised to 10s, first
   * five fetches dropped as warmup grace) so Turbopack/Vite/Astro hot-compile
   * latency doesn't trip the watchdog when auditing localhost.
   */
  detectedFramework?: DetectedFramework;
}

/** Frameworks the readiness probe knows to grace. */
export type DetectedFramework = "nextjs" | "vite" | "astro";

/** v0.4: detect dev-server framework from response headers. Returns null when not a known dev server. */
export function detectDevServer(headers: Record<string, string>): DetectedFramework | null {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  const xpb = lower["x-powered-by"] ?? "";
  if (xpb.toLowerCase().includes("next")) return "nextjs";
  // x-nextjs-* headers (next/server runtime) and __nextjs_* cookies.
  const cookie = lower["set-cookie"] ?? lower["cookie"] ?? "";
  if (Object.keys(lower).some((k) => k.startsWith("x-nextjs-")) || /__nextjs_/i.test(cookie)) {
    return "nextjs";
  }
  if (Object.keys(lower).some((k) => k.startsWith("x-vite-"))) return "vite";
  if (Object.keys(lower).some((k) => k.startsWith("x-astro-"))) return "astro";
  return null;
}

export interface ReadinessThresholds {
  /** p95 at or above this → verdict 'not-ready' (absolute cap). Default 3000. */
  notReadyP95Ms?: number;
  /** p95 at or above this (but below notReadyP95Ms) → 'concerning'. Default 800. */
  concerningP95Ms?: number;
  /** 5xx/live ratio at or above this → 'not-ready' regardless of latency. Default 0.1. */
  notReadyErrorRatio?: number;
  /**
   * v0.4: when set to a known framework, the absolute p95 cap is raised to 10s
   * (Turbopack/Vite hot-compile envelope) and the first 5 live fetches are
   * dropped from the percentile calculation as warmup grace.
   */
  detectedFramework?: DetectedFramework | null;
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
 * hits). Null is a signal to callers that the finding should be suppressed:
 * it's not a result worth displaying.
 */
export function computeReadiness(
  observations: readonly FetchObservation[],
  thresholds: ReadinessThresholds = {},
): ReadinessReport | null {
  const framework = thresholds.detectedFramework ?? null;
  // Dev servers (Next/Vite/Astro) routinely take seconds on cold compile.
  // Spec §4.7: cap p95 at 10s and skip the first 5 fetches as warmup grace.
  const isDevFramework = framework !== null;
  const defaultNotReady = isDevFramework ? 10000 : 3000;
  const defaultConcerning = isDevFramework ? 3000 : 800;

  const t = {
    notReadyP95Ms: thresholds.notReadyP95Ms ?? defaultNotReady,
    concerningP95Ms: thresholds.concerningP95Ms ?? defaultConcerning,
    notReadyErrorRatio: thresholds.notReadyErrorRatio ?? 0.1,
  };

  // Live fetches = anything that actually spoke to the origin (revalidation
  // counts because the 304 round-trip is a real network call).
  const live = observations.filter((o) => !o.fromCache || o.revalidated);
  if (live.length === 0) return null;

  // Warmup grace: drop the first 5 live fetches from latency percentiles when
  // a dev-server framework was detected. Keep them in the success/error ratios
  // so genuine 5xx during warmup still surface.
  const liveForLatency = isDevFramework && live.length > 5
    ? live.slice(5)
    : live;
  const durations = liveForLatency.map((o) => o.durationMs).sort((a, b) => a - b);
  const medianMs = durations.length > 0 ? percentile(durations, 50) : 0;
  const p95Ms = durations.length > 0 ? percentile(durations, 95) : 0;

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
    ...(framework ? { detectedFramework: framework } : {}),
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
