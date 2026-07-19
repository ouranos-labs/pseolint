import type { FieldVitals } from "./types.js";

type FetchFn = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<Response>;

/** CrUX "poor" tier is derived at the rule; the client only reports raw p75s. */
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

const ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";

function num(m: CruxMetric | undefined): number | null {
  const p = m?.percentiles?.p75;
  if (p === undefined) return null;
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

/**
 * Chrome UX Report field-data client. Returns real-user p75 for LCP, CLS, and
 * INP — the metrics Google actually ranks on, including INP, which a passive
 * lab render can't produce. Requires a free CrUX API key; with no key it makes
 * no calls. Any network / parse / no-data condition resolves to `null` for that
 * key — never throws, so a missing-field-data page just falls back to lab vitals.
 *
 * CrUX only has data for URLs/origins with enough real traffic. Most pSEO
 * long-tail URLs return 404 (no field data), so this queries each audited URL
 * up to `maxUrlLookups`, then assigns every page its ORIGIN's field data as a
 * fallback (one request per origin, cached). Pages that individually resolve at
 * the URL level get the more precise `source: "url"` reading.
 *
 * ponytail: per-URL lookups are capped (default 150) to bound request volume on
 * large crawls; every page still gets the origin-level signal. Raise the cap via
 * the `--crux-max-lookups` flag if you need per-URL precision on more pages.
 */
export async function fetchCruxFieldVitals(
  urls: readonly string[],
  apiKey: string,
  opts: {
    fetchFn?: FetchFn;
    timeoutMs?: number;
    maxUrlLookups?: number;
    /** Called once with the number of URLs that only got origin-level data (cap hit). */
    onCapped?: (skipped: number) => void;
  } = {},
): Promise<Map<string, FieldVitals>> {
  const out = new Map<string, FieldVitals>();
  if (!apiKey || urls.length === 0) return out;

  const fetchFn = opts.fetchFn ?? (globalThis.fetch as unknown as FetchFn);
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxUrlLookups = opts.maxUrlLookups ?? 150;

  async function query(body: { url: string } | { origin: string }): Promise<FieldVitals | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        // @ts-ignore -- AbortSignal is accepted by fetch; not in the narrow FetchFn type
        signal: controller.signal,
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
    // 404 = no field data for this key (common for low-traffic URLs) — not an error.
    if (!res.ok) return null;
    let body2: CruxRecord;
    try {
      body2 = (await res.json()) as CruxRecord;
    } catch {
      return null;
    }
    const m = body2.record?.metrics;
    if (!m) return null;
    const lcp = num(m.largest_contentful_paint);
    const cls = num(m.cumulative_layout_shift);
    const inp = num(m.interaction_to_next_paint);
    if (lcp === null && cls === null && inp === null) return null;
    return { lcp, cls, inp, source: "url" };
  }

  // One origin lookup per distinct origin, cached and reused as the fallback.
  const originCache = new Map<string, FieldVitals | null>();
  async function originVitals(origin: string): Promise<FieldVitals | null> {
    if (originCache.has(origin)) return originCache.get(origin) ?? null;
    const v = await query({ origin });
    const stored = v ? { ...v, source: "origin" as const } : null;
    originCache.set(origin, stored);
    return stored;
  }

  let capped = 0;
  let looked = 0;
  for (const url of urls) {
    const origin = originOf(url);
    const ov = origin ? await originVitals(origin) : null;

    if (looked < maxUrlLookups) {
      looked += 1;
      const uv = await query({ url });
      if (uv) {
        out.set(url, uv);
        continue;
      }
    } else if (origin) {
      capped += 1;
    }
    if (ov) out.set(url, ov);
  }

  if (capped > 0) opts.onCapped?.(capped);
  return out;
}
