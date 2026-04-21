import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { blocklist } from "@/db/schema";

export type BlocklistHit = { key: string; reason: string | null };

export async function checkBlocklist(keys: string[]): Promise<BlocklistHit | null> {
  if (keys.length === 0) return null;
  const rows = await db
    .select({ key: blocklist.key, reason: blocklist.reason })
    .from(blocklist)
    .where(inArray(blocklist.key, keys))
    .limit(1);
  return rows[0] ?? null;
}

export function userBlockKey(userId: string): string {
  return `user:${userId}`;
}

export function hostBlockKey(host: string): string {
  return `host:${host.toLowerCase().replace(/^www\./, "")}`;
}
