import { inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export interface RateLimitBumper {
  runBump(key: string): Promise<number>;
}

let bumper: RateLimitBumper = {
  async runBump(key: string): Promise<number> {
    const expiresAt = startOfNextUtcDay();
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: sql`${rateLimits.count} + 1` },
      })
      .returning({ count: rateLimits.count });
    return row.count;
  },
};

export function __setDbForTests(b: RateLimitBumper): void { bumper = b; }

export async function bumpRateLimit(key: string, limit: number): Promise<{ allowed: boolean; count: number }> {
  const count = await bumper.runBump(key);
  return { allowed: count <= limit, count };
}

/**
 * Give back one unit on each counter: the inverse of `bumpRateLimit`. Used when
 * a request that already bumped its counters is rejected by a later gate, and
 * when a dispatched run fails, so a failure never costs the caller a slot (a
 * "Try again" that is guaranteed to be rejected is worse than no button).
 *
 * Best-effort by design: a refund failure must never become a user-facing
 * error, so it logs and resolves. Counters floor at 0.
 */
export async function refundRateLimits(keys: readonly string[]): Promise<void> {
  const unique = [...new Set(keys)].filter(Boolean);
  if (unique.length === 0) return;
  try {
    await db
      .update(rateLimits)
      .set({ count: sql`GREATEST(${rateLimits.count} - 1, 0)` })
      .where(inArray(rateLimits.key, unique));
  } catch (e) {
    console.warn("[rate-limit] refund failed:", e instanceof Error ? e.message : e);
  }
}

function startOfNextUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}
