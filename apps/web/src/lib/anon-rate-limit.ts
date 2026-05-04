import { sql } from "drizzle-orm";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { hashIp } from "@/lib/ip";
import { ANON_DAILY_CAP } from "@/lib/audit-limits";

/**
 * Atomically reserve a slot for an anon audit submission today for the given IP.
 * Returns the new count on success, null if at/over cap.
 *
 * Lives outside `audit-limits` so the constants module stays free of any
 * server-only imports (db, drizzle, hashIp). That lets client components
 * (e.g. WatchedPagesCard) consume `WATCHED_PAGES_CAP` without dragging
 * `db/index.ts` into the browser bundle, which trips env validation.
 */
export async function reserveAnonAuditSlot(ip: string): Promise<number | null> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `anon:audit:${hashIp(ip)}:${day}`;
  const expires = new Date(Date.now() + 25 * 3600 * 1000);

  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, expiresAt: expires })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: { count: sql`${rateLimits.count} + 1` },
      where: sql`${rateLimits.count} < ${ANON_DAILY_CAP}`,
    })
    .returning({ count: rateLimits.count });

  if (!row) return null;
  return row.count;
}
