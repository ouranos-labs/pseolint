import "server-only";
import { Polar, HTTPClient } from "@polar-sh/sdk";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles, users, webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";

/**
 * Pinned Polar API version (YYYY-MM).
 * Polar introduces quarterly date-based API versioning starting October 1, 2026.
 * Pinning to 2026-04 maintains contract stability until January 2027.
 */
export const POLAR_API_VERSION = "2026-04";

export function createPolarHttpClient(): HTTPClient {
  const httpClient = new HTTPClient();
  httpClient.addHook("beforeRequest", (req) => {
    req.headers.set("Polar-Version", POLAR_API_VERSION);
    return req;
  });
  return httpClient;
}

/**
 * True when a real Polar token is set. Outside production env.ts fills in a
 * `*_placeholder` token so dev boots without a full .env; calling Polar with it
 * only produces 401s, so treat it as "billing not configured".
 */
export function isPolarConfigured(): boolean {
  const token = env().POLAR_ACCESS_TOKEN;
  return !!token && !token.endsWith("placeholder");
}

function polarClient(): Polar {
  const token = env().POLAR_ACCESS_TOKEN;
  if (!token) {
    throw new Error("Polar is not configured: POLAR_ACCESS_TOKEN is missing");
  }
  return new Polar({
    accessToken: token,
    httpClient: createPolarHttpClient(),
  });
}

export async function createCheckoutSession(opts: {
  productId: string;
  customerEmail: string;
  successUrl: string;
  /** Where Polar's back button returns to when the buyer abandons checkout. */
  returnUrl?: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string }> {
  const res = await polarClient().checkouts.create({
    products: [opts.productId],
    successUrl: opts.successUrl,
    returnUrl: opts.returnUrl,
    customerEmail: opts.customerEmail,
    metadata: opts.metadata,
  });
  if (!res.url) throw new Error("Polar did not return a checkout URL");
  return { url: res.url };
}

export async function createCustomerPortalUrl(customerId: string, returnUrl?: string): Promise<string> {
  const session = await polarClient().customerSessions.create({ customerId, returnUrl });
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
 * dashboard self-heal sync: keeping a single writer prevents drift between paths.
 */
export async function upsertProSubscription(opts: {
  userId: string;
  polarCustomerId: string | null;
  plan: "pro" | "free";
  planExpiresAt: Date | null;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
}): Promise<void> {
  const state = {
    polarCustomerId: opts.polarCustomerId,
    plan: opts.plan,
    planExpiresAt: opts.planExpiresAt,
    subscriptionStatus: opts.subscriptionStatus,
    cancelAtPeriodEnd: opts.cancelAtPeriodEnd,
  };
  await db.insert(userProfiles).values({ userId: opts.userId, ...state })
    .onConflictDoUpdate({ target: userProfiles.userId, set: state });
}

/**
 * Resolve the local user a Polar subscription belongs to. `metadata.userId` is
 * set at checkout and survives the buyer typing a different email into Polar's
 * form, so it wins; the case-insensitive email match covers subscriptions
 * created before we attached metadata. Email casing varies between BetterAuth
 * (preserves what the user typed) and Polar (often lowercases), hence lower().
 */
export async function findUserForSubscription(opts: {
  metadataUserId?: string | null;
  email?: string | null;
}): Promise<{ id: string; matchedBy: "metadata" | "email" } | undefined> {
  if (opts.metadataUserId) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, opts.metadataUserId))
      .limit(1);
    if (u) return { id: u.id, matchedBy: "metadata" };
  }
  if (opts.email) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${opts.email.toLowerCase()}`)
      .limit(1);
    if (u) return { id: u.id, matchedBy: "email" };
  }
  return undefined;
}

/**
 * Immediately end every live Polar subscription belonging to a user (revoke, not
 * cancel-at-period-end: the account is about to stop existing, so there is no
 * period left to honour). Looks subscriptions up by checkout metadata and by the
 * stored customer id, since either can be missing on older rows.
 *
 * Throws when Polar can't confirm the revocation. Callers deleting an account
 * MUST abort on throw: deleting the user while a subscription survives keeps
 * charging someone who can no longer sign in to cancel it.
 */
export async function revokeUserSubscriptions(opts: {
  userId: string;
  polarCustomerId: string | null;
}): Promise<{ revoked: number }> {
  if (!isPolarConfigured()) {
    // No billing in this environment. A stored customer id means one existed
    // somewhere, so refuse rather than silently orphan it.
    if (opts.polarCustomerId) throw new Error("Polar is not configured; cannot cancel the subscription");
    return { revoked: 0 };
  }
  const client = polarClient();
  const ids = new Set<string>();
  const collect = async (req: Parameters<Polar["subscriptions"]["list"]>[0]): Promise<void> => {
    for await (const page of await client.subscriptions.list(req)) {
      for (const sub of page.result?.items ?? []) ids.add(sub.id);
    }
  };
  await collect({ metadata: { userId: opts.userId }, active: true, limit: 100 });
  if (opts.polarCustomerId) await collect({ customerId: opts.polarCustomerId, active: true, limit: 100 });
  for (const id of ids) await client.subscriptions.revoke({ id });
  return { revoked: ids.size };
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
  if (!isPolarConfigured()) return { kind: "polar_unavailable" };

  const client = polarClient();

  // Strategy: find any subscription for this user. We embed `userId` in checkout
  // metadata, so try metadata first; fall back to filtering by customer email.
  // Polar's list returns most recent first; we pick the first active one (or the
  // most recent if none is active, so a canceled-with-grace state is still reflected).
  type Sub = {
    status: string;
    cancelAtPeriodEnd?: boolean;
    currentPeriodEnd?: Date | string | null;
    customerId?: string | null;
    customer?: { id?: string } | null;
  };
  let candidates: Sub[] = [];

  try {
    // Filter by metadata.userId, most reliable since we set it at checkout.
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
    subscriptionStatus: chosen.status,
    cancelAtPeriodEnd: chosen.cancelAtPeriodEnd ?? false,
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
