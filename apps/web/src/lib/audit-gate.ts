import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { bumpRateLimit } from "@/lib/rate-limit";
import { todayDateString } from "@/lib/ids";
import { devFlags } from "@/lib/dev-flags";
import { checkBlocklist, hostBlockKey, userBlockKey } from "@/lib/blocklist";
import { DAILY_AUDIT_CAP, PER_HOST_DAILY_CAP, PER_HOST_HOURLY_LIMIT, PER_USER_HOST_DAILY_PRO } from "@/lib/audit-limits";

// Defined in audit-limits (db-free, so /limits and /abuse can quote them);
// re-exported here for existing importers.
export { PER_HOST_HOURLY_LIMIT, PER_USER_HOST_DAILY_PRO };

/**
 * Maximum concurrent queued/running audits owned by one Pro user. Bounds the
 * Inngest queue depth one caller can occupy.
 */
export const IN_FLIGHT_LIMIT_PRO = 5;

function currentHourKey(): string {
  return new Date().toISOString().slice(0, 13);
}

/**
 * The rate-limit counter keys the Pro gate bumps, in gate order. Exported so
 * the route can refund exactly these keys when the request is later rejected
 * or the run fails (see refundRateLimits).
 */
export function proGateKeys(userId: string, host: string): { daily: string; hostHourly: string; userHost: string } {
  const today = todayDateString();
  return {
    daily: `pro:${userId}:${today}`,
    hostHourly: `audit-host:${host}:${currentHourKey()}`,
    userHost: `user-host:${userId}:${host}:${today}`,
  };
}

/**
 * Pro-tier audit gate suite. Returns null when the audit may proceed, or a
 * short reason string for telemetry / UI mapping when it should be denied.
 *
 * The five gates evaluated, in order:
 *   1. Blocklist (host or user explicitly banned)
 *   2. Daily Pro audit cap (50/day)
 *   3. Per-host hourly cap (30/hr)
 *   4. Per-user-per-host daily cap (15/day)
 *   5. In-flight cap (5 queued/running)
 *
 * `devFlags.rateLimitDisabled` short-circuits to allow, matching the public
 * POST /api/audits behaviour.
 *
 * Reason strings: "blocklisted" | "per_user" | "per_host" | "per_user_host" | "in_flight"
 *
 * Known limitation (matches /api/audits route, planned fix in v0.5.4):
 * `bumpRateLimit` increments before the allow check, so a request blocked by
 * gate N still increments the counters for gates 1..N-1. In practice the
 * effect is small: counters TTL daily/hourly, but a Pro user repeatedly
 * hitting the per-host cap will burn their daily budget without firing an
 * audit. The fix is a reserve-then-commit gate primitive; deferred to keep
 * this v0.5.3 tail focused.
 */
export async function assertProAuditAllowed(args: {
  userId: string;
  host: string;
}): Promise<string | null> {
  if (devFlags.rateLimitDisabled) return null;

  const keys = proGateKeys(args.userId, args.host);

  const blocked = await checkBlocklist([hostBlockKey(args.host), userBlockKey(args.userId)]);
  if (blocked) return "blocklisted";

  const dailyRes = await bumpRateLimit(keys.daily, DAILY_AUDIT_CAP.pro);
  if (!dailyRes.allowed) return "per_user";

  const hostRes = await bumpRateLimit(keys.hostHourly, PER_HOST_HOURLY_LIMIT);
  if (!hostRes.allowed) return "per_host";

  const userHostRes = await bumpRateLimit(keys.userHost, PER_USER_HOST_DAILY_PRO);
  if (!userHostRes.allowed) return "per_user_host";

  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(audits)
    .where(and(
      eq(audits.userId, args.userId),
      inArray(audits.status, ["queued", "running"]),
    ));
  if (count >= IN_FLIGHT_LIMIT_PRO) return "in_flight";

  return null;
}
