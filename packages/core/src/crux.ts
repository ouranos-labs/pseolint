import type { FieldVitals } from "./types.js";

type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<Response>;

interface CruxMetric {
  percentiles?: { p75?: number | string };
}
interface CruxRecord {
  record?: {
    metrics?: {
      largest_contentful_paint?: CruxMetric;
      cumulative_layout_shift?: CruxMetric;
      interaction_to_next_paint?: CruxMetric;
    };
  };
}

export type CruxFormFactor = "phone" | "desktop" | "all";

const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
const DEFAULT_CAP = 150;
const DEFAULT_CONCURRENCY = 6;

function num(m: CruxMetric | undefined): number | null {
  const p = m?.percentiles?.p75;
  if (p === undefined || p === "") return null;
  const n = typeof p === "string" ? Number(p) : p;
  return Number.isFinite(n) ? n : null;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Bounded-concurrency map — runs `fn` over `items` with at most `limit` in flight. */
async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

/**
 * Chrome UX Report field-data client. Returns real-user p75 for LCP, CLS, and
 * INP — the metrics Google actually ranks on, including INP, which a passive
 * lab render can't produce. Requires a free CrUX API key; with no key it makes
 * no calls. Any per-key failure resolves to "no data" — never throws, so a
 * missing-field-data page just falls back to lab vitals.
 *
 * CrUX only has data for URLs/origins with enough real traffic. Most pSEO
 * long-tail URLs have none, so this queries each origin once (shared as a
 * fallback) and each URL up to `maxUrlLookups`, then assigns every page the
 * more precise per-URL reading where available and the origin reading
 * otherwise. Both origin and per-URL fetches run pooled (`concurrency`).
 *
 * `maxUrlLookups`: undefined → default cap (150); `0` → unlimited (matches the
 * `--sample-size` / `--max-per-template` "0 = all" convention). Operational
 * failures (429 rate-limit, 401/403 bad key, 5xx, network) are surfaced via
 * `onHttpError` — a 404 is NOT an error (it just means "no field data").
 */
export async function fetchCruxFieldVitals(
  urls: readonly string[],
  apiKey: string,
  opts: {
    fetchFn?: FetchFn;
    timeoutMs?: number;
    maxUrlLookups?: number;
    concurrency?: number;
    formFactor?: CruxFormFactor;
    /** Called with the count of URLs skipped for per-URL lookup because the cap was hit. */
    onCapped?: (skipped: number) => void;
    /** Called once with the distinct non-404 HTTP/network statuses seen (e.g. [429]). */
    onHttpError?: (statuses: number[]) => void;
  } = {},
): Promise<Map<string, FieldVitals>> {
  const out = new Map<string, FieldVitals>();
  if (!apiKey || urls.length === 0) return out;

  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchFn);
  const timeoutMs = opts.timeoutMs ?? 8000;
  const cap = opts.maxUrlLookups === 0 ? Infinity : opts.maxUrlLookups ?? DEFAULT_CAP;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const formFactorField =
    opts.formFactor === "phone" ? "PHONE" : opts.formFactor === "desktop" ? "DESKTOP" : undefined;

  // 0 = network/timeout; any non-200/non-404 status is operational (429/401/403/5xx).
  const errorStatuses = new Set<number>();
  function noteStatus(status: number): void {
    if (status !== 200 && status !== 404) errorStatuses.add(status);
  }

  async function query(body: { url: string } | { origin: string }): Promise<FieldVitals | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formFactorField ? { ...body, form_factor: formFactorField } : body),
        // @ts-ignore -- AbortSignal is accepted by fetch; not in the narrow FetchFn type
        signal: controller.signal,
      });
    } catch {
      noteStatus(0); // network / timeout / abort
      return null;
    } finally {
      clearTimeout(timer);
    }
    noteStatus(res.status);
    if (!res.ok) return null;
    let parsed: CruxRecord;
    try {
      parsed = (await res.json()) as CruxRecord;
    } catch {
      return null;
    }
    const m = parsed.record?.metrics;
    if (!m) return null;
    const lcp = num(m.largest_contentful_paint);
    const cls = num(m.cumulative_layout_shift);
    const inp = num(m.interaction_to_next_paint);
    if (lcp === null && cls === null && inp === null) return null;
    return { lcp, cls, inp, source: "url" };
  }

  // Origin-level lookups: one per distinct origin, pooled, reused as fallback.
  const origins = [...new Set(urls.map(originOf).filter((o): o is string => o !== null))];
  const originCache = new Map<string, FieldVitals | null>(
    await mapPool(origins, concurrency, async (origin) => {
      const v = await query({ origin });
      return [origin, v ? { ...v, source: "origin" as const } : null] as const;
    }),
  );

  // Per-URL lookups: first `cap` URLs, pooled. Pages beyond the cap use origin data.
  const perUrlTargets = cap === Infinity ? urls : urls.slice(0, cap);
  const perUrlMap = new Map<string, FieldVitals | null>(
    await mapPool(perUrlTargets, concurrency, async (url) => [url, await query({ url })] as const),
  );

  for (const url of urls) {
    const uv = perUrlMap.get(url);
    if (uv) {
      out.set(url, uv);
      continue;
    }
    const origin = originOf(url);
    const ov = origin ? originCache.get(origin) ?? null : null;
    if (ov) out.set(url, ov);
  }

  const capSkipped = Math.max(0, urls.length - perUrlTargets.length);
  if (capSkipped > 0) opts.onCapped?.(capSkipped);
  if (errorStatuses.size > 0) opts.onHttpError?.([...errorStatuses].sort((a, b) => a - b));
  return out;
}
