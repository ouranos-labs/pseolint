"use server";

import { and, eq } from "drizzle-orm";
import { getRequiredSession } from "@/lib/session";
import { db } from "@/db";
import { leaderboardClaims, audits } from "@/db/schema";
import {
  dnsClaimInstructions, verifyDnsClaim, verifyGscClaim,
} from "@/lib/leaderboard-claims";
import { revalidatePath } from "next/cache";

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/** Show the DNS TXT record the caller must publish to claim `host`. */
export async function getDnsClaimInstructionsAction(host: string) {
  const session = await getRequiredSession();
  return dnsClaimInstructions(session.user.id, normalizeHost(host));
}

/**
 * Attempt to claim `host`. Tries the GSC fast-path first, then DNS. On success,
 * upserts a verified leaderboard_claim row owned by the caller. A host already
 * claimed by a different account cannot be stolen.
 */
export async function claimHostAction(
  host: string,
): Promise<{ ok: true; method: "gsc" | "dns" } | { error: string }> {
  const session = await getRequiredSession();
  const userId = session.user.id;
  const h = normalizeHost(host);

  const [exists] = await db
    .select({ id: audits.id })
    .from(audits)
    .where(and(eq(audits.host, h), eq(audits.isPublic, true), eq(audits.status, "completed")))
    .limit(1);
  if (!exists) return { error: "No public audit exists for this site yet." };

  // Block stealing a host already owned by someone else.
  const [existing] = await db
    .select({ userId: leaderboardClaims.userId })
    .from(leaderboardClaims)
    .where(eq(leaderboardClaims.host, h))
    .limit(1);
  if (existing && existing.userId !== userId)
    return { error: "This site is already claimed by another account." };

  let method: "gsc" | "dns" | null = null;
  if (await verifyGscClaim(userId, h)) method = "gsc";
  else if (await verifyDnsClaim(userId, h)) method = "dns";
  if (!method) {
    return {
      error:
        "Ownership not verified. Connect Google Search Console for this property, or publish the DNS TXT record and try again.",
    };
  }

  if (existing) {
    await db
      .update(leaderboardClaims)
      .set({ method, verifiedAt: new Date() })
      .where(eq(leaderboardClaims.host, h));
  } else {
    await db.insert(leaderboardClaims).values({ host: h, userId, method, verifiedAt: new Date() });
  }

  revalidatePath("/leaderboard");
  return { ok: true, method };
}

/** Owner-only: update display overrides / pin / hide. */
export async function updateClaimAction(input: {
  host: string;
  ogTitleOverride?: string | null;
  ogDescriptionOverride?: string | null;
  pinnedAuditId?: string | null;
  isHidden?: boolean;
}): Promise<{ ok: true } | { error: string }> {
  const session = await getRequiredSession();
  const h = normalizeHost(input.host);
  const [claim] = await db
    .select()
    .from(leaderboardClaims)
    .where(eq(leaderboardClaims.host, h))
    .limit(1);
  if (!claim || claim.userId !== session.user.id) return { error: "You don't own this listing." };

  await db
    .update(leaderboardClaims)
    .set({
      ...(input.ogTitleOverride !== undefined
        ? { ogTitleOverride: input.ogTitleOverride }
        : {}),
      ...(input.ogDescriptionOverride !== undefined
        ? { ogDescriptionOverride: input.ogDescriptionOverride }
        : {}),
      ...(input.pinnedAuditId !== undefined ? { pinnedAuditId: input.pinnedAuditId } : {}),
      ...(input.isHidden !== undefined ? { isHidden: input.isHidden } : {}),
    })
    .where(eq(leaderboardClaims.host, h));

  revalidatePath("/leaderboard");
  return { ok: true };
}
