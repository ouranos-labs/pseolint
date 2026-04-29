/**
 * Adopt audits created in an anonymous browser session into a real user account.
 *
 * Fires from better-auth's `session.create.after` hook — covers both first-time
 * signup AND returning users who ran an anon audit then signed in. After the
 * UPDATE we clear the anon cookie so a single anon batch can't be re-claimed
 * by a different account on a later sign-in from the same browser.
 */
import { cookies } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { auditLog } from "@/lib/audit-log";

const ANON_COOKIE = "pseolint_anon";

export async function claimAnonAudits(userId: string): Promise<void> {
  let anonId: string | undefined;
  try {
    const store = await cookies();
    anonId = store.get(ANON_COOKIE)?.value;
    if (!anonId || !/^[a-zA-Z0-9_-]{21}$/.test(anonId)) return;

    // Only claim audits still owned by this anon session — never overwrite
    // an existing userId, even if the cookie somehow leaked across users.
    const claimed = await db
      .update(audits)
      .set({
        userId,
        anonSessionId: null,
        // Anon audits expire after 1 day; bump to at least free-tier (30d) on claim.
        // GREATEST avoids shortening a longer-lived audit (e.g. if the schema ever changes).
        expiresAt: sql`GREATEST(${audits.expiresAt}, NOW() + INTERVAL '30 days')`,
      })
      .where(and(eq(audits.anonSessionId, anonId), isNull(audits.userId)))
      .returning({ id: audits.id });

    if (claimed.length > 0) {
      auditLog("audit.claimed", { userId, count: claimed.length });
    }

    store.delete(ANON_COOKIE);
  } catch (e) {
    auditLog("audit.claim_failed", {
      userId,
      anonId: anonId ?? null,
      err: e instanceof Error ? e.message : String(e),
    });
  }
}
