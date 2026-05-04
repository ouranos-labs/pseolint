import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { bumpRateLimit } from "@/lib/rate-limit";
import { todayDateString } from "@/lib/ids";
import { devFlags } from "@/lib/dev-flags";
import { checkBlocklist, hostBlockKey, userBlockKey } from "@/lib/blocklist";
import { DAILY_AUDIT_CAP } from "@/lib/audit-limits";

/**
 * Per-host audit ceiling per hour, applied across all tiers — protects target
 * sites from amplification (e.g. a viral homepage submission). Mirrors the
 * inline value in `apps/web/src/app/api/audits/route.ts` until that handler is
 * refactored to call this module directly (planned for v0.5.4).
 */
export const PER_HOST_HOURLY_LIMIT = 30;

/**
 * Anti-harassment cap: a single Pro user can only audit one host this many
 * times in a given UTC day. Bounds realistic damage if a Pro account is used
 * to repeatedly hit a third-party site.
 */
export const PER_USER_HOST_DAILY_PRO = 15;

/**
 * Maximum concurrent queued/running audits owned by one Pro user. Bounds the
 * Inngest queue depth one caller can occupy.
 */
export const IN_FLIGHT_LIMIT_PRO = 5;

function currentHourKey(): string {
  return new Date().toISOString().slice(0, 13);
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
 * effect is small — counters TTL daily/hourly — but a Pro user repeatedly
 * hitting the per-host cap will burn their daily budget without firing an
 * audit. The fix is a reserve-then-commit gate primitive; deferred to keep
 * this v0.5.3 tail focused.
 */
export async function assertProAuditAllowed(args: {
  userId: string;
  host: string;
}): Promise<string | null> {
  if (devFlags.rateLimitDisabled) return null;

  const today = todayDateString();
  const hour = currentHourKey();

  const blocked = await checkBlocklist([hostBlockKey(args.host), userBlockKey(args.userId)]);
  if (blocked) return "blocklisted";

  const dailyKey = `pro:${args.userId}:${today}`;
  const dailyRes = await bumpRateLimit(dailyKey, DAILY_AUDIT_CAP.pro);
  if (!dailyRes.allowed) return "per_user";

  const hostKey = `audit-host:${args.host}:${hour}`;
  const hostRes = await bumpRateLimit(hostKey, PER_HOST_HOURLY_LIMIT);
  if (!hostRes.allowed) return "per_host";

  const userHostKey = `user-host:${args.userId}:${args.host}:${today}`;
  const userHostRes = await bumpRateLimit(userHostKey, PER_USER_HOST_DAILY_PRO);
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
