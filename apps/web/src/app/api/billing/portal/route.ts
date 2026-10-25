import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { createCustomerPortalUrl } from "@/lib/polar";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(): Promise<Response> {
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }

  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  const billingPage = (error?: string) =>
    NextResponse.redirect(new URL(`/dashboard/settings/billing${error ? `?error=${error}` : ""}`, base), 303);

  const [profile] = await db
    .select({ polarCustomerId: userProfiles.polarCustomerId })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);

  // No customer id yet (webhook not landed, or never subscribed): the billing
  // page explains this and offers the resync, instead of bouncing to /pricing.
  if (!profile?.polarCustomerId) return billingPage("portal");

  try {
    const url = await createCustomerPortalUrl(profile.polarCustomerId, `${base}/dashboard/settings/billing`);
    return NextResponse.redirect(url, 303);
  } catch (e) {
    console.error("[billing portal] customer session failed:", e instanceof Error ? e.message : e);
    return billingPage("portal_unavailable");
  }
}
