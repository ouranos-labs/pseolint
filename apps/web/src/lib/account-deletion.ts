import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, userProfiles, users } from "@/db/schema";
import { deleteReport } from "@/lib/r2";
import { revokeUserSubscriptions } from "@/lib/polar";

/** Thrown when Polar can't confirm the subscription ended; nothing was deleted. */
export class BillingCancelError extends Error {
  constructor(cause: unknown) {
    super("Couldn't cancel your subscription with our payment provider", { cause });
    this.name = "BillingCancelError";
  }
}

/** Best-effort removal of every R2 object (JSON summary + HTML report) a user's audits own. */
export async function deleteUserReports(userId: string): Promise<void> {
  const userAudits = await db
    .select({ storageKey: audits.storageKey })
    .from(audits)
    .where(eq(audits.userId, userId));
  for (const a of userAudits) {
    if (!a.storageKey) continue;
    const sibling = a.storageKey.endsWith(".json")
      ? a.storageKey.replace(/\.json$/, ".html")
      : a.storageKey.replace(/\.html$/, ".json");
    try { await deleteReport(a.storageKey); } catch { /* already gone */ }
    try { await deleteReport(sibling); } catch { /* best-effort */ }
  }
}

/**
 * The one account-deletion path (settings action + DELETE /api/account).
 * Order matters: billing first, because it is the only step that can't be
 * cleaned up afterwards. If Polar fails we throw BillingCancelError before
 * touching anything, so the user can retry and is never left deleted-but-billed.
 * Reports go next (they need the audit rows to find their keys), then the user
 * row, which cascades to everything else via FKs.
 */
export async function deleteUserAccount(userId: string): Promise<{ revokedSubscriptions: number }> {
  const [profile] = await db
    .select({ polarCustomerId: userProfiles.polarCustomerId })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  let revoked: number;
  try {
    ({ revoked } = await revokeUserSubscriptions({
      userId,
      polarCustomerId: profile?.polarCustomerId ?? null,
    }));
  } catch (e) {
    console.error("[account deletion] subscription revoke failed, aborting:", e instanceof Error ? e.message : e);
    throw new BillingCancelError(e);
  }

  await deleteUserReports(userId);
  await db.delete(users).where(eq(users.id, userId));
  return { revokedSubscriptions: revoked };
}
