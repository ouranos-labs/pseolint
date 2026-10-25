import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";

export type Plan = "free" | "pro";

export async function getPlan(userId: string): Promise<Plan> {
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

export type BillingState = {
  plan: Plan;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  planExpiresAt: Date | null;
};

/** Effective plan plus the raw subscription fields the billing UI needs, in one read. */
export async function getBillingState(userId: string): Promise<BillingState> {
  const [p] = await db
    .select({
      plan: userProfiles.plan,
      expires: userProfiles.planExpiresAt,
      subscriptionStatus: userProfiles.subscriptionStatus,
      cancelAtPeriodEnd: userProfiles.cancelAtPeriodEnd,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!p) {
    return { plan: "free", subscriptionStatus: null, cancelAtPeriodEnd: false, planExpiresAt: null };
  }
  return {
    plan: p.plan === "pro" && (!p.expires || p.expires > new Date()) ? "pro" : "free",
    subscriptionStatus: p.subscriptionStatus,
    cancelAtPeriodEnd: p.cancelAtPeriodEnd,
    planExpiresAt: p.expires,
  };
}
