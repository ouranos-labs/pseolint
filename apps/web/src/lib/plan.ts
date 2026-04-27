import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { devFlags } from "@/lib/dev-flags";

export type Plan = "free" | "pro";

export async function getPlan(userId: string): Promise<Plan> {
  // Dev bypass: every sessioned user is treated as Pro. Off in production by
  // default (see dev-flags.ts — requires explicit DEV_PRO_BYPASS=1 there).
  if (devFlags.proBypass) return "pro";
  const [p] = await db
    .select({ plan: userProfiles.plan, expires: userProfiles.planExpiresAt })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!p) return "free";
  if (p.plan === "pro" && (!p.expires || p.expires > new Date())) return "pro";
  return "free";
}

/** @deprecated use getPlan */
export async function getPlanForUser(userId: string): Promise<Plan> {
  return getPlan(userId);
}
