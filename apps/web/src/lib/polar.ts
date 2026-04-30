import { Polar } from "@polar-sh/sdk";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
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
