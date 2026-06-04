/**
 * Curated list of well-known programmatic-SEO sites the leaderboard seeds with.
 * Each is audited FOR REAL by the seed-leaderboard Inngest function; clean ones
 * (risk < 40) appear with a "Notable" chip, failing ones are never named and
 * only feed the aggregate stat. This is editorial input — review/expand before
 * running a seed pass.
 *
 * SCALING NOTE: the seed-leaderboard function audits these in one Inngest run
 * (maxDuration 300s ≈ 6–8 sites/run, resumable across retries). To seed dozens,
 * switch to event fan-out (one "seed/host.requested" event per host). Not built
 * yet — keep this list small until then.
 */
export interface SeedSite {
  host: string;
  /** Optional grouping label for future category sub-lists; unused today. */
  category?: string;
}

export const SEED_SITES: SeedSite[] = [
  { host: "zapier.com", category: "integrations-directory" },
  { host: "nomadlist.com", category: "travel-data" },
  { host: "wise.com", category: "fintech-rates" },
  { host: "tripadvisor.com", category: "travel-directory" },
  { host: "indeed.com", category: "jobs" },
  { host: "g2.com", category: "software-reviews" },
];
