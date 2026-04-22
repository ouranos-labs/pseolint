import { db } from "@/db";
import { rateLimits } from "@/db/schema";
import { hashIp } from "@/lib/ip";
import { sql } from "drizzle-orm";

export const PAGE_CAP = { anon: 50, free: 200, pro: Number.MAX_SAFE_INTEGER } as const;
export const ANON_DAILY_CAP = 3;

export function pageCapFor(tier: "anon" | "free" | "pro"): number {
  return PAGE_CAP[tier];
}

/**
 * Atomically reserve a slot for an anon audit submission today for the given IP.
 * Returns the new count on success, null if at/over cap.
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

  if (!row) return null;   // conflict where-guard rejected
  return row.count;
}
