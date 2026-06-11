import { cachedFetch, type Fetcher } from "./cache.js";

/**
 * Pre-flight origin health check.
 *
 * `BackpressureMonitor` (./backpressure.ts) protects an origin *during* an
 * audit — but by the time it trips, the crawl has already fired dozens of
 * requests at a struggling server. The paperforge/Neon incident is the
 * canonical case: each fetch fanned out into uncached DB queries and the
 * crawl had already exhausted the egress quota before backpressure noticed.
 *
 * This check runs *before* the audit is dispatched. It fires a handful of
 * concurrent probes at the target's entry URL — concurrent, not sequential, so
 * it observes the origin the way the real crawl will hit it (parallel fetches
 * that fan out into uncached work), rather than the rosier one-request-at-a-time
 * picture. It returns an `ok` / `unreachable` / `degraded` verdict; callers can
 * refuse to dispatch, or fall back to a gentler (lower-concurrency) crawl,
 * instead of finishing the job a struggling server started.
 *
 * Conservative by design: a single transient timeout never trips it. We only
 * report `unreachable` when *every* probe fails, and `degraded` when the
 * majority error out or the origin is sustainedly slow. The thresholds default
 * to the same 8s latency ceiling `BackpressureMonitor` uses, so the pre-flight
 * verdict and the in-flight watchdog agree on what "too slow" means.
 */

export type OriginVerdict = "ok" | "unreachable" | "degraded";

export interface OriginPreflightOptions {
  /** Concurrent probes to fire at the origin. Default 3. */
  probes?: number;
  /** Per-probe timeout in ms. Default 5000. */
  timeoutMs?: number;
  /**
   * Median response time (ms) above which the origin is judged too slow to
   * crawl safely. Default 8000 — mirrors `BackpressureMonitor`'s `absoluteP95Ms`
   * so the pre-flight and in-flight gates share one definition of "too slow".
   */
  slowMedianMs?: number;
  /**
   * Fraction of *responding* probes that may return 5xx before the origin is
   * judged degraded. Default 0.5 (a strict majority must error). Compared with
   * `>` so landing exactly on the threshold does not trip — matching the
   * backpressure monitor's 2026-05-03 strict-comparison fix.
   */
  errorRatioThreshold?: number;
  /** Abort the whole check (e.g. request cancelled). */
  signal?: AbortSignal;
  /** Injectable fetch for tests / custom transport. Forwarded to `cachedFetch`. */
  fetcher?: Fetcher;
  /**
   * Per-hop SSRF validator. Defaults to the same DNS-validated host check
   * `safeFetch` uses, so probes can't be redirected at a private/loopback
   * address. Overridable for tests so they don't depend on DNS.
   */
  validateHop?: (url: string) => Promise<void>;
}

export interface OriginProbeSample {
  /** HTTP status, or null if the probe never got a response (timeout/network). */
  status: number | null;
  /** Wall-clock duration of the probe in ms. */
  durationMs: number;
  /** Error message when the probe failed without a response. */
  error?: string;
}

export interface OriginPreflightReport {
  verdict: OriginVerdict;
  /** Human-readable explanation when `verdict !== "ok"`. */
  reason?: string;
  /** Median latency (ms) across probes that returned a response. 0 if none did. */
  medianMs: number;
  /** Slowest probe latency (ms) observed. */
  maxMs: number;
  /** 5xx responses ÷ responses received. 0 when nothing responded. */
  errorRatio: number;
  /** Probes that returned any HTTP response. */
  responded: number;
  /** Probes attempted. */
  attempted: number;
  /** Per-probe detail, for logging. */
  samples: OriginProbeSample[];
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** The same DNS-validated per-hop SSRF check `safeFetch` applies. */
async function defaultValidateHop(u: string): Promise<void> {
  const { validateTargetHost } = await import("./ssrf-guard.js");
  let host: string;
  try {
    host = new URL(u).hostname;
  } catch {
    throw new Error(`origin-preflight: invalid URL ${u}`);
  }
  await validateTargetHost(host);
}

/**
 * Probe a target origin and return a health verdict. Probes fire concurrently,
 * so the measured latency reflects the origin under parallel load (the way the
 * crawl hits it), and the wall-clock cost is ~one request, not N. SSRF-safe —
 * every probe and redirect hop is re-validated against private/loopback ranges.
 * Never throws: any unexpected internal failure resolves to an `ok` verdict so
 * a bug here can never block a legitimate audit (fail-open).
 */
export async function checkOriginHealth(
  url: string,
  options: OriginPreflightOptions = {},
): Promise<OriginPreflightReport> {
  const probes = Math.max(1, options.probes ?? 3);
  const timeoutMs = options.timeoutMs ?? 5000;
  const slowMedianMs = options.slowMedianMs ?? 8000;
  const errorRatioThreshold = options.errorRatioThreshold ?? 0.5;
  const validateHop = options.validateHop ?? defaultValidateHop;

  const oneProbe = async (): Promise<OriginProbeSample> => {
    const startedAt = Date.now();
    try {
      const res = await cachedFetch(url, {
        timeoutMs,
        cache: null,
        signal: options.signal,
        followRedirects: true,
        fetcher: options.fetcher,
        validateHop,
      });
      return { status: res.status, durationMs: Date.now() - startedAt };
    } catch (e) {
      return { status: null, durationMs: Date.now() - startedAt, error: (e as Error).message };
    }
  };

  // Already cancelled → no probes, fail-open to "ok" (a false "unreachable"
  // would be worse than letting the audit proceed and trip the in-flight watchdog).
  const samples: OriginProbeSample[] = options.signal?.aborted
    ? []
    : await Promise.all(Array.from({ length: probes }, oneProbe));

  const attempted = samples.length;
  const responses = samples.filter((s) => s.status !== null);
  const responded = responses.length;
  const latencies = responses.map((s) => s.durationMs);
  const medianMs = median(latencies);
  const maxMs = latencies.length > 0 ? Math.max(...latencies) : 0;
  const serverErrors = responses.filter((s) => s.status! >= 500 && s.status! < 600).length;
  const errorRatio = responded > 0 ? serverErrors / responded : 0;

  const base = { medianMs, maxMs, errorRatio, responded, attempted, samples };

  // Nothing ever responded — the origin is down, blocking us, or unreachable.
  // Requires *every* probe to fail so one transient timeout can't trip it.
  if (attempted > 0 && responded === 0) {
    return {
      verdict: "unreachable",
      reason: `no response from ${attempted} probe${attempted === 1 ? "" : "s"} (timeout or connection error)`,
      ...base,
    };
  }

  if (errorRatio > errorRatioThreshold) {
    return {
      verdict: "degraded",
      reason: `origin returned 5xx on ${serverErrors} of ${responded} probes (${Math.round(errorRatio * 100)}%)`,
      ...base,
    };
  }

  if (medianMs > slowMedianMs) {
    return {
      verdict: "degraded",
      reason: `origin median response ${medianMs}ms exceeds ${slowMedianMs}ms — a full crawl would likely make it worse`,
      ...base,
    };
  }

  return { verdict: "ok", ...base };
}
