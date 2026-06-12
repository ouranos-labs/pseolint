import type { AuthorityProvider } from "./provider.js";

type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

interface OprEntry {
  status_code: number;
  page_rank_decimal?: number;
  domain: string;
}

/**
 * Open PageRank authority source. Returns 0–100 (page_rank_decimal × 10).
 * Requires a free API key; with no key it returns null (no calls). Any network
 * or per-domain error → null. Attribution ("Open PageRank by DomCop") is the
 * caller's responsibility when displaying.
 */
export class OpenPageRankProvider implements AuthorityProvider {
  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: FetchFn = globalThis.fetch as unknown as FetchFn,
    private readonly timeoutMs = 8000,
  ) {}

  async authorityFor(domain: string): Promise<number | null> {
    if (!this.apiKey) return null;
    const url = `https://openpagerank.com/api/v1.0/getPageRank?domains[]=${encodeURIComponent(domain)}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, { headers: { "API-OPR": this.apiKey } });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    let body: { response?: OprEntry[] };
    try {
      body = (await res.json()) as { response?: OprEntry[] };
    } catch {
      return null;
    }
    const entry = body.response?.find((e) => e.domain === domain) ?? body.response?.[0];
    if (!entry || entry.status_code !== 200 || typeof entry.page_rank_decimal !== "number") return null;
    return Math.round(entry.page_rank_decimal * 10);
  }
}
