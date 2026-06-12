/** A source of domain authority on a 0–100 scale (higher = more authoritative). */
export interface AuthorityProvider {
  /** Authority for a registrable domain; null when unknown/unavailable. */
  authorityFor(domain: string): Promise<number | null>;
}

/**
 * Combines several providers. Returns the MAX non-null score (any source
 * vouching for authority is sufficient evidence). All-null → null → callers
 * apply no moderation (fail-safe). A source that throws is treated as null.
 */
export class CompositeAuthorityProvider implements AuthorityProvider {
  constructor(private readonly sources: ReadonlyArray<AuthorityProvider>) {}

  async authorityFor(domain: string): Promise<number | null> {
    const results = await Promise.all(
      this.sources.map(async (s) => {
        try {
          return await s.authorityFor(domain);
        } catch {
          return null;
        }
      }),
    );
    const vals = results.filter((v): v is number => v !== null && Number.isFinite(v));
    return vals.length ? Math.max(...vals) : null;
  }
}
