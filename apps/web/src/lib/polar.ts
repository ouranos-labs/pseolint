import { Polar } from "@polar-sh/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles, webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";

function polarClient(): Polar {
  const token = env().POLAR_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Polar is not configured: POLAR_ACCESS_TOKEN is missing");
  }
  return new Polar({ accessToken: token });
}

export async function createCheckoutSession(opts: {
  productId: string;
  customerEmail: string;
  successUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string }> {
  const res = await polarClient().checkouts.create({
    products: [opts.productId],
    successUrl: opts.successUrl,
    customerEmail: opts.customerEmail,
    metadata: opts.metadata,
  });
  if (!res.url) throw new Error("Polar did not return a checkout URL");
  return { url: res.url };
}

export async function createCustomerPortalUrl(customerId: string): Promise<string> {
  const session = await polarClient().customerSessions.create({ customerId });
  if (!session.customerPortalUrl) throw new Error("Polar did not return a portal URL");
  return session.customerPortalUrl;
}

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due"]);

export function isActiveSubscriptionStatus(status: string): boolean {
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

export async function rememberEventOnce(eventId: string): Promise<boolean> {
  try { await db.insert(webhookEvents).values({ eventId }); return true; } catch { return false; }
}

/**
 * Upsert a user's Pro subscription state. Used by both the webhook handler and the
 * dashboard self-heal sync — keeping a single writer prevents drift between paths.
 */
export async function upsertProSubscription(opts: {
  userId: string;
  polarCustomerId: string | null;
  plan: "pro" | "free";
  planExpiresAt: Date | null;
}): Promise<void> {
  await db.insert(userProfiles).values({
    userId: opts.userId,
    polarCustomerId: opts.polarCustomerId,
    plan: opts.plan,
    planExpiresAt: opts.planExpiresAt,
  }).onConflictDoUpdate({
    target: userProfiles.userId,
    set: {
      polarCustomerId: opts.polarCustomerId,
      plan: opts.plan,
      planExpiresAt: opts.planExpiresAt,
    },
  });
}

export type SyncResult =
  | { kind: "synced"; plan: "pro" | "free"; planExpiresAt: Date | null }
  | { kind: "no_subscription" }
  | { kind: "polar_unavailable" };

/**
 * Self-healing fallback for when the webhook is missed or delayed: ask Polar for the
 * user's most recent subscription matching this `userId` (via metadata) or `email`,
 * and reflect it in our DB. Idempotent; safe to call on every dashboard load.
 */
export async function syncUserSubscriptionFromPolar(opts: {
  userId: string;
  email: string;
}): Promise<SyncResult> {
  if (!env().POLAR_ACCESS_TOKEN) return { kind: "polar_unavailable" };

  const client = polarClient();

  // Strategy: find any subscription for this user. We embed `userId` in checkout
  // metadata, so try metadata first; fall back to filtering by customer email.
  // Polar's list returns most recent first; we pick the first active one (or the
  // most recent if none is active, so a canceled-with-grace state is still reflected).
  type Sub = {
    status: string;
    currentPeriodEnd?: Date | string | null;
    customerId?: string | null;
    customer?: { id?: string } | null;
  };
  let candidates: Sub[] = [];

  try {
    // Filter by metadata.userId — most reliable since we set it at checkout.
    const byMeta = await client.subscriptions.list({
      metadata: { userId: opts.userId },
      limit: 10,
    });
    for await (const page of byMeta) {
      const items = (page.result?.items ?? []) as Sub[];
      candidates.push(...items);
    }
  } catch (e) {
    console.warn("[polar sync] list-by-metadata failed:", e instanceof Error ? e.message : e);
  }

  if (candidates.length === 0) {
    try {
      // Fall back to listing by customer email. Two API calls (customer lookup + sub list).
      const customersPage = await client.customers.list({ email: opts.email, limit: 1 });
      let customerId: string | undefined;
      for await (const page of customersPage) {
        const item = page.result?.items?.[0];
        if (item?.id) { customerId = item.id; break; }
      }
      if (customerId) {
        const bySub = await client.subscriptions.list({ customerId, limit: 10 });
        for await (const page of bySub) {
          const items = (page.result?.items ?? []) as Sub[];
          candidates.push(...items);
        }
      }
    } catch (e) {
      console.warn("[polar sync] list-by-email failed:", e instanceof Error ? e.message : e);
    }
  }

  if (candidates.length === 0) return { kind: "no_subscription" };

  // Prefer an active-ish subscription; otherwise take the most recent.
  const active = candidates.find((s) => isActiveSubscriptionStatus(s.status));
  const chosen = active ?? candidates[0];

  const plan = isActiveSubscriptionStatus(chosen.status) ? "pro" : "free";
  const planExpiresAt = chosen.currentPeriodEnd ? new Date(chosen.currentPeriodEnd) : null;
  const polarCustomerId = chosen.customer?.id ?? chosen.customerId ?? null;

  await upsertProSubscription({
    userId: opts.userId,
    polarCustomerId,
    plan,
    planExpiresAt,
  });

  return { kind: "synced", plan, planExpiresAt };
}

/**
 * Returns true if the user already has a Pro plan in our DB. Cheap pre-check before
 * calling Polar API on every dashboard render.
 */
export async function userIsAlreadyPro(userId: string): Promise<boolean> {
  const [p] = await db
    .select({ plan: userProfiles.plan, expires: userProfiles.planExpiresAt })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!p) return false;
  return p.plan === "pro" && (!p.expires || p.expires > new Date());
}
