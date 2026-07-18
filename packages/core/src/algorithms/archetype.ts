/**
 * Programmatic-SEO archetype — the site's content strategy, inferred by the
 * triage LLM (tier 1) and persisted as a first-class signal (tier 2). Kept as a
 * shared vocabulary so triage, the audit row, and any future consumer agree.
 */
export const ARCHETYPES = [
  "directory",
  "comparison",
  "location-pages",
  "glossary",
  "aggregator",
  "programmatic-blog",
  "other",
] as const;

export type Archetype = (typeof ARCHETYPES)[number];
