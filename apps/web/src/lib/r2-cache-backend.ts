import { cacheKeyFor, type AnyCacheEntry, type CacheBackend } from "@pseolint/core";
import { fetchJson, uploadJson } from "@/lib/r2";

/**
 * R2-backed implementation of the core engine's CacheBackend, so hosted audits
 * can reuse fetched pages across runs despite Vercel's ephemeral filesystem.
 *
 * Keyed `audit-cache/<host>/<sha256(url)>` (per-domain prefix → scoped clear +
 * a per-host blast radius). Fully fail-safe: any R2 error is a cache miss (get)
 * or a swallowed no-op (set) — the core's freshness/revalidation logic does the
 * rest, and a flaky R2 degrades to "uncached," never a broken audit. Retention
 * is an R2 lifecycle rule on `audit-cache/*`, not code here.
 *
 * Server-only (constructed in run-audit / the Inngest worker). Never import this
 * into a client-reachable module — it pulls the @pseolint/core barrel.
 */
export class R2CacheBackend implements CacheBackend {
  constructor(private readonly host: string) {}

  private keyFor(url: string): string {
    return `audit-cache/${this.host}/${cacheKeyFor(url)}`;
  }

  async get(url: string): Promise<AnyCacheEntry | null> {
    try {
      const raw = await fetchJson(this.keyFor(url)); // null on miss
      if (!raw) return null;
      return JSON.parse(raw) as AnyCacheEntry;
    } catch {
      return null; // malformed JSON or transient R2 error → treat as a miss
    }
  }

  async set(url: string, entry: AnyCacheEntry): Promise<void> {
    try {
      await uploadJson(this.keyFor(url), JSON.stringify(entry));
    } catch {
      // best-effort: a failed cache write must never surface to the audit
    }
  }
}
