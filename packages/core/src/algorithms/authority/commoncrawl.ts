import type { AuthorityProvider } from "./provider.js";

/**
 * Authority from a pre-processed Common Crawl host-webgraph table
 * (registrable domain -> harmonic-centrality rank normalized to 0–100).
 * Owned/permissive data (CC license; attribution courtesy). The table is built
 * offline (gated); this provider is a pure lookup. Empty table -> null.
 */
export class CommonCrawlProvider implements AuthorityProvider {
  constructor(private readonly table: ReadonlyMap<string, number>) {}

  async authorityFor(domain: string): Promise<number | null> {
    const v = this.table.get(domain);
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
}
