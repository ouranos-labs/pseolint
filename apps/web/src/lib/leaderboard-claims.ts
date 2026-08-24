import "server-only";
import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leaderboardClaims } from "@/db/schema";
import { verifyTxtName, verifyDomainToken } from "@/lib/domain-verify";
import { loadGscTokens, listSites, pickBestGscProperty } from "@/lib/gsc";

/**
 * Deterministic DNS-claim token for (userId, host). Stateless: recomputed on
 * verify rather than storing a pending challenge. HMAC over the auth secret so
 * it's unguessable but reproducible. Host lowercased for stability.
 *
 * Reads BETTER_AUTH_SECRET directly from process.env (with empty-string
 * fallback for module-load safety) so the function stays pure: no env()
 * call means no zod parse at test time, which keeps unit tests fast and
 * independent of the full env schema.
 */
export function claimToken(userId: string, host: string): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  return createHmac("sha256", secret)
    .update(`${userId}:${host.toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
}

/** The DNS TXT record name + value the user must publish to claim via DNS. */
export function dnsClaimInstructions(userId: string, host: string): { name: string; value: string } {
  return { name: verifyTxtName(host), value: claimToken(userId, host) };
}

/** Verify a DNS claim by checking the deterministic token at _pseolint-verify.<host>. */
export async function verifyDnsClaim(userId: string, host: string): Promise<boolean> {
  return verifyDomainToken(host, claimToken(userId, host));
}

/**
 * GSC fast-path: true when the user's connected GSC account controls a property
 * covering `host`. Reuses listSites + pickBestGscProperty. False on no tokens /
 * no match / API error.
 */
export async function verifyGscClaim(userId: string, host: string): Promise<boolean> {
  try {
    const tokens = await loadGscTokens(userId);
    if (!tokens) return false;
    const sites = await listSites(userId);
    return pickBestGscProperty(sites, host) !== null;
  } catch {
    return false;
  }
}

export type Claim = typeof leaderboardClaims.$inferSelect;

/** Fetch the claim row for a host (null = unclaimed). */
export async function getClaim(host: string): Promise<Claim | null> {
  const [row] = await db
    .select()
    .from(leaderboardClaims)
    .where(eq(leaderboardClaims.host, host.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/** True when host has a verified claim owned by userId. */
export async function isClaimedBy(host: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ host: leaderboardClaims.host })
    .from(leaderboardClaims)
    .where(and(eq(leaderboardClaims.host, host.toLowerCase()), eq(leaderboardClaims.userId, userId)))
    .limit(1);
  return !!row;
}
