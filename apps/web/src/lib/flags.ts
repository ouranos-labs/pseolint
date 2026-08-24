/**
 * Direct Google Indexing API submission is gated OFF by default.
 *
 * Two independent reasons it isn't ready to expose:
 *  1. Structural: the Indexing API officially only crawls JobPosting /
 *     BroadcastEvent schema. Google ignores requests for general pSEO pages,
 *     so "submit for indexing" would be a promise we can't keep.
 *  2. Onboarding: the service-account → GSC delegation path is broken by a
 *     Google-side bug ("email address not found", started ~April 2026, still
 *     unresolved as of June 2026).
 *
 * IndexNow + sitemaps remain the supported, honest path. Flip the env var to
 * "true" to re-enable once there's a genuine use case (e.g. JobPosting content)
 * and the onboarding story is sound.
 *
 * Declared NEXT_PUBLIC_ on purpose: the flag drives both the server-side gate
 * (in indexing-actions) and the "Coming soon" UI treatment, so a single env
 * var is the one source of truth read identically on both sides.
 */
export const GOOGLE_INDEXING_ENABLED =
  process.env.NEXT_PUBLIC_GOOGLE_INDEXING_ENABLED === "true";

/** User-facing copy for the gated-off state, shared across UI and server. */
export const GOOGLE_INDEXING_COMING_SOON =
  "Direct Google submission is coming soon; use IndexNow + sitemaps for now.";
