/**
 * Single source of truth for leaderboard eligibility and the search-indexability
 * of /r/[slug] report pages. Imported by run-audit (retention), the leaderboard
 * query (gating + ordering), and r/[slug] generateMetadata (robots directive).
 *
 * Eligibility = "may a clean, public audit be NAMED publicly and indexed?".
 * Spec: docs/superpowers/specs/2026-06-04-leaderboard-clean-corpus-design.md §0–§3.
 */

/** Risk strictly below this is leaderboard-eligible (A/B bands). Tunable. */
export const LEADERBOARD_RISK_MAX = 40;

/** Too-small samples produce volatile rankings — exclude below this. */
export const LEADERBOARD_MIN_PAGES = 5;

/**
 * Far-future expiry sentinel. JS max date (year 275760) does NOT round-trip
 * through Postgres timestamptz, so we use this value (already used for Pro
 * audits in api/audits/route.ts).
 */
export const PERMANENT_EXPIRES_AT = "9999-12-31T23:59:59.999Z";

export interface EligibilityInput {
  isPublic: boolean;
  status: string;
  host: string | null;
  pageCount: number | null;
  risk: number | null;
}

/** True when a completed audit is clean + public enough to be listed and indexed. */
export function isLeaderboardEligible(a: EligibilityInput): boolean {
  return (
    a.isPublic &&
    a.status === "completed" &&
    a.host !== null &&
    a.host.length > 0 &&
    a.pageCount !== null &&
    a.pageCount >= LEADERBOARD_MIN_PAGES &&
    a.risk !== null &&
    a.risk < LEADERBOARD_RISK_MAX
  );
}

/**
 * Robots directive for a /r/[slug] page. Only leaderboard-eligible reports are
 * indexed; every private/failing/thin/expired report stays noindex,nofollow
 * (the historical default). expiresAt is intentionally NOT an input here —
 * eligible audits have their expiry extended to PERMANENT_EXPIRES_AT, and an
 * expired row never reaches this function (the page renders ExpiredState first).
 */
export function reportRobots(a: EligibilityInput): { index: boolean; follow: boolean } {
  const ok = isLeaderboardEligible(a);
  return { index: ok, follow: ok };
}
