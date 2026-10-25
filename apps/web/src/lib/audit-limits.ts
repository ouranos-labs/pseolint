export const PAGE_CAP = { anon: 50, free: 200, pro: Number.MAX_SAFE_INTEGER } as const;
export const ANON_DAILY_CAP = 3;

/**
 * Daily audit caps by tier: the numbers shown on /limits, /pricing, and the
 * homepage. Single source of truth so marketing copy and rate-limit code can't
 * drift. Anon is enforced separately via `reserveAnonAuditSlot` (per-IP) and a
 * per-session bumpRateLimit gate (anti-cookie-clear); both use ANON_DAILY_CAP.
 */
export const DAILY_AUDIT_CAP = { free: 5, pro: 50 } as const;

/**
 * Per-host audit ceiling per hour, applied across all tiers: protects target
 * sites from amplification (e.g. a viral homepage submission). Enforced in
 * `lib/audit-gate.ts` and `app/api/audits/route.ts`.
 */
export const PER_HOST_HOURLY_LIMIT = 30;

/**
 * Anti-harassment: how many times one caller may audit the SAME host per UTC
 * day, by tier. Anon is enforced per session cookie and per IP. Lives here (not
 * in the route) so the client-side error copy quotes the same numbers the
 * server enforces.
 */
export const PER_HOST_DAILY_CAP = { anon: 1, free: 3, pro: 15 } as const;

/**
 * Anti-harassment cap: a single Pro user can only audit one host this many
 * times in a given UTC day. Bounds realistic damage if a Pro account is used
 * to repeatedly hit a third-party site.
 */
export const PER_USER_HOST_DAILY_PRO = PER_HOST_DAILY_CAP.pro;


/**
 * Sample-size ceilings for server-triggered Pro audits. The public POST
 * /api/audits handler has its own `SAMPLE_SIZE_CEILING = 300` for cost
 * protection on user-submitted forms; the larger budgets here apply to
 * authenticated dashboard actions and the monitoring scheduler:
 *   - PRO_REAUDIT_SAMPLE_SIZE: dashboard "Re-audit now" + monitoring kickoff.
 *     Marketing: "up to 500 pages on manual re-audits".
 *   - PRO_MONITOR_SAMPLE_SIZE: weekly cron monitoring run.
 *     Marketing: "200 pages on the recurring weekly cron".
 *   - DOWNGRADED_MONITOR_SAMPLE_SIZE: a domain still being scanned after its
 *     owner downgraded to free: bounded so we don't keep doing Pro-sized work
 *     for a free user.
 */
export const PRO_REAUDIT_SAMPLE_SIZE = 500;
export const PRO_MONITOR_SAMPLE_SIZE = 200;
export const DOWNGRADED_MONITOR_SAMPLE_SIZE = 50;

/**
 * v0.5.3: per-domain "watched pages" cap. Free users see an upgrade CTA
 * (cap is 0: the UI doesn't surface the form). Pro users can pin up to 20
 * URLs per monitored domain; each pinned URL is force-refetched on every
 * monitoring run via `auditSource(..., { force: { urls } })`.
 */
export const WATCHED_PAGES_CAP = { free: 0, pro: 20 } as const;

export function pageCapFor(tier: "anon" | "free" | "pro"): number {
  return PAGE_CAP[tier];
}
