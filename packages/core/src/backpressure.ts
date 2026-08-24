import type { FetchObservation } from "./fetch-observer.js";

/**
 * In-flight backpressure watchdog for audit crawls.
 *
 * Goal: protect the user's origin (and their bill) when our crawl triggers a
 * cascade of expensive requests: the paperforge case, where each fetch fanned
 * out into a chain of uncached DB queries that exhausted the Neon free-tier
 * egress quota.
 *
 * Design:
 *   - First `warmupSize` origin fetches establish a baseline p95 latency.
 *     During warmup, the monitor never aborts: we don't know what "normal"
 *     looks like yet.
 *   - After warmup, every new observation updates a rolling window. If the
 *     rolling p95 exceeds `max(baseline × multiplier, absoluteP95Ms)` OR the
 *     5xx ratio exceeds `errorRatioThreshold`, the monitor votes for abort.
 *   - Pure cache hits (no origin round-trip) are ignored: they don't stress
 *     the origin and would otherwise mask degradation (a cached page looks
 *     "fast" even when the origin is collapsing).
 *
 * The monitor is passive: it returns a decision but does not touch the
 * AbortController itself. Callers hook it into their fetch pipeline and
 * trigger the abort on their end so tests don't have to mock signals.
 */

export interface BackpressureOptions {
  /** Origin fetches (excluding cache hits) required before trips are allowed.
   *  During this window the monitor records but never aborts. */
  warmupSize: number;
  /** Absolute p95 cap in milliseconds. p95 ≥ this → abort. */
  absoluteP95Ms: number;
  /** Post-warmup p95 must exceed `baseline × multiplier` before tripping on
   *  relative slowdown. Catches "origin was fine, now it's 3× slower". */
  baselineMultiplier: number;
  /** Abort when 5xx ratio in the rolling window ≥ this. */
  errorRatioThreshold: number;
  /** Size of the rolling window for post-warmup stats. Default 20. */
  rollingWindowSize?: number;
}

export interface BackpressureDecision {
  shouldAbort: boolean;
  /** Populated when `shouldAbort` is true: human-readable reason. */
  reason?: string;
  /** Snapshot of the metrics that drove the decision (for error reporting). */
  snapshot?: BackpressureSnapshot;
}

export interface BackpressureSnapshot {
  /** Rolling p95 in ms (post-warmup). */
  p95Ms: number;
  /** Baseline p95 computed during warmup. 0 if not yet established. */
  baselineP95Ms: number;
  /** 5xx ratio in the rolling window. */
  errorRatio: number;
  /** Total origin (non-cached) fetches seen. */
  liveFetchCount: number;
}

export class OriginDegradedError extends Error {
  readonly diagnostics: BackpressureSnapshot;

  constructor(reason: string, diagnostics: BackpressureSnapshot) {
    super(
      `Origin looks degraded: aborting audit. ${reason}. ` +
        `p95=${diagnostics.p95Ms}ms, baseline=${diagnostics.baselineP95Ms}ms, ` +
        `5xx=${Math.round(diagnostics.errorRatio * 100)}%, fetches=${diagnostics.liveFetchCount}.`,
    );
    this.name = "OriginDegradedError";
    this.diagnostics = diagnostics;
  }
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, rank))];
}

export class BackpressureMonitor {
  private readonly opts: Required<BackpressureOptions>;
  private readonly liveDurations: number[] = [];
  private readonly liveStatuses: number[] = [];
  private baselineP95Ms = 0;

  constructor(opts: BackpressureOptions) {
    this.opts = {
      rollingWindowSize: 20,
      ...opts,
    };
  }

  record(o: FetchObservation): BackpressureDecision {
    // Pure cache hits don't stress the origin.
    if (o.fromCache && !o.revalidated) return { shouldAbort: false };

    this.liveDurations.push(o.durationMs);
    this.liveStatuses.push(o.status);

    // Still in warmup: establish baseline, never abort.
    if (this.liveDurations.length <= this.opts.warmupSize) {
      if (this.liveDurations.length === this.opts.warmupSize) {
        this.baselineP95Ms = percentile(this.liveDurations, 95);
      }
      return { shouldAbort: false };
    }

    const window = this.opts.rollingWindowSize;
    const recentDurations = this.liveDurations.slice(-window);
    const recentStatuses = this.liveStatuses.slice(-window);

    const p95Ms = percentile(recentDurations, 95);
    const errorCount = recentStatuses.filter((s) => s >= 500 && s < 600).length;
    const errorRatio = errorCount / recentStatuses.length;
    const snapshot: BackpressureSnapshot = {
      p95Ms,
      baselineP95Ms: this.baselineP95Ms,
      errorRatio,
      liveFetchCount: this.liveDurations.length,
    };

    // 2026-05-03 production fix: all three abort conditions previously used
    // `>=` ("greater than or equal"), which meant they fired at the EXACT
    // threshold, e.g. 3-of-30 fetches returning 5xx is exactly 10%, so
    // the abort message read "5xx rate 10% exceeds threshold 10%" while
    // the rate had not actually exceeded anything. Changed to strict `>`
    // so the gate matches the message: only abort when the metric is
    // genuinely past the threshold, not when it lands on it.
    if (p95Ms > this.opts.absoluteP95Ms) {
      return {
        shouldAbort: true,
        reason: `rolling p95 ${p95Ms}ms exceeds absolute cap ${this.opts.absoluteP95Ms}ms`,
        snapshot,
      };
    }
    if (
      this.baselineP95Ms > 0 &&
      p95Ms > this.baselineP95Ms * this.opts.baselineMultiplier
    ) {
      return {
        shouldAbort: true,
        reason: `rolling p95 ${p95Ms}ms is ${(p95Ms / this.baselineP95Ms).toFixed(1)}× the warmup baseline ${this.baselineP95Ms}ms`,
        snapshot,
      };
    }
    if (errorRatio > this.opts.errorRatioThreshold) {
      return {
        shouldAbort: true,
        reason: `rolling 5xx rate ${Math.round(errorRatio * 100)}% exceeds threshold ${Math.round(this.opts.errorRatioThreshold * 100)}%`,
        snapshot,
      };
    }

    return { shouldAbort: false, snapshot };
  }
}
