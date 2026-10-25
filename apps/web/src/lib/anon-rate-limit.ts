import "server-only";
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
/** The per-IP daily counter key `reserveAnonAuditSlot` reserves against (used for refunds). */
export function anonAuditSlotKey(ip: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return `anon:audit:${hashIp(ip)}:${day}`;
}

export async function reserveAnonAuditSlot(ip: string): Promise<number | null> {
  const key = anonAuditSlotKey(ip);
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
