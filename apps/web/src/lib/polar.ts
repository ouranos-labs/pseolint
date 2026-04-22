import { Polar } from "@polar-sh/sdk";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";

export const polar = new Polar({ accessToken: env().POLAR_ACCESS_TOKEN });

export async function createCheckoutSession(opts: {
  productId: string;
  customerEmail: string;
  successUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string }> {
  const res = await polar.checkouts.create({
    products: [opts.productId],
    successUrl: opts.successUrl,
    customerEmail: opts.customerEmail,
    metadata: opts.metadata,
  });
  if (!res.url) throw new Error("Polar did not return a checkout URL");
  return { url: res.url };
}

export async function rememberEventOnce(eventId: string): Promise<boolean> {
  try { await db.insert(webhookEvents).values({ eventId }); return true; } catch { return false; }
}
