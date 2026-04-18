import { sql } from "drizzle-orm";
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

function startOfNextUtcDay(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
}
