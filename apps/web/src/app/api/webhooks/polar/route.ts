import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles, audits, webhookEvents } from "@/db/schema";
import { env } from "@/lib/env";
import {
  rememberEventOnce,
  isActiveSubscriptionStatus,
  findUserForSubscription,
  upsertProSubscription,
} from "@/lib/polar";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import { ensureMonitoredDomainForUser } from "@/lib/monitoring";
import { trackServer, identifyServer, revenueServer } from "@/lib/analytics/track.server";

export const runtime = "nodejs";

/**
 * We must not 2xx an event we couldn't apply to a paying user: Polar only retries
 * non-2xx, so a 200 here silently leaves a paid user on Free. Forget the event id
 * too, otherwise the retry is swallowed by the idempotency check as a duplicate.
 */
async function unmatched(webhookId: string, type: string, detail: Record<string, unknown>): Promise<Response> {
  console.error("[polar webhook] no local user for paid subscription event; returning 500 so Polar retries", {
    webhookId, type, ...detail,
  });
  await db.delete(webhookEvents).where(eq(webhookEvents.eventId, webhookId));
  return NextResponse.json({ error: "user_not_found" }, { status: 500 });
}

export async function POST(req: Request): Promise<Response> {
  const webhookSecret = env().POLAR_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "webhook_unavailable" }, { status: 503 });
  }

  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  let event;
  try {
    event = validateEvent(rawBody, headers, webhookSecret);
  } catch (e) {
    console.warn("[polar webhook] validateEvent failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // Polar uses standardwebhooks; the webhook-id header is the unique event identifier.
  const webhookId = headers["webhook-id"];
  if (!webhookId) return NextResponse.json({ error: "missing webhook-id" }, { status: 400 });

  const seen = await rememberEventOnce(webhookId);
  if (!seen) return NextResponse.json({ ok: true, duplicate: true });

  // subscription.active fires when a subscription transitions to active (e.g. trial→active,
  // incomplete→active). Treat it the same as created/updated for plan-state purposes so we
  // don't miss the upgrade if Polar happens to send active without a preceding created we
  // can act on (e.g. webhook endpoint added after the subscription was created).
  // subscription.uncanceled is the "Resume Pro" path: it clears cancelAtPeriodEnd.
  if (
    event.type === "subscription.created" ||
    event.type === "subscription.updated" ||
    event.type === "subscription.active" ||
    event.type === "subscription.uncanceled"
  ) {
    const customer = event.data.customer;
    const email = customer?.email ?? null;
    const md = (event.data.metadata ?? {}) as Record<string, string>;
    // active|trialing|past_due all keep the user on Pro until currentPeriodEnd;
    // past_due covers Polar's renewal-retry window (~7 days) so a transient card
    // failure doesn't immediately downgrade an active subscriber.
    const plan = isActiveSubscriptionStatus(event.data.status) ? "pro" : "free";

    const u = await findUserForSubscription({ metadataUserId: md.userId, email });
    if (!u) {
      // A non-paying state for an unknown user (e.g. the revoke that account
      // deletion triggers) has nothing to apply; retrying it would never succeed.
      if (plan !== "pro") return NextResponse.json({ ok: true, note: "no user; nothing to apply" });
      return unmatched(webhookId, event.type, {
        subscriptionId: event.data.id, customerId: customer?.id, metadataUserId: md.userId ?? null,
      });
    }

    const planExpiresAt = event.data.currentPeriodEnd ? new Date(event.data.currentPeriodEnd) : null;
    await upsertProSubscription({
      userId: u.id,
      polarCustomerId: customer.id,
      plan,
      planExpiresAt,
      subscriptionStatus: event.data.status,
      cancelAtPeriodEnd: event.data.cancelAtPeriodEnd,
    });

    // Keep the analytics profile's plan in step with the DB. It is otherwise
    // only ever written at sign-in, so every breakdown-by-plan misreports
    // anyone who upgraded or lapsed since they last signed in.
    await identifyServer({ profileId: u.id, email: email ?? undefined, properties: { plan } });

    if (
      (event.type === "subscription.created" || event.type === "subscription.active") &&
      plan === "pro"
    ) {
      const interval =
        event.data.recurringInterval === "month" ? "monthly"
        : event.data.recurringInterval === "year" ? "yearly"
        : "unknown";
      await trackServer(
        { name: "subscription_started", props: { interval, intent: md.intent ?? null } },
        { profileId: u.id },
      );
      // Polar quotes amounts in minor units (cents); OpenPanel's __revenue is
      // major units. Without this the subscription event carries an interval
      // but no money, so there is no MRR, LTV, or revenue-by-channel at all.
      await revenueServer(
        event.data.amount / 100,
        { currency: event.data.currency, interval, intent: md.intent ?? null },
        { profileId: u.id },
      );
    }

    if (event.type === "subscription.created" && md.intent === "monitor" && md.auditSlug) {
      try {
        const [audit] = await db
          .select({ sourceUrl: audits.sourceUrl, userId: audits.userId })
          .from(audits)
          .where(eq(audits.slug, md.auditSlug))
          .limit(1);
        if (audit && audit.userId === u.id) {
          await ensureMonitoredDomainForUser(u.id, audit.sourceUrl);
        } else {
          console.warn("[polar webhook] monitor-intent audit not found or userId mismatch", { auditSlug: md.auditSlug });
        }
      } catch (e) {
        console.error("[polar webhook] monitor-intent binding failed:", e);
        // Do not fail the webhook: user can add domain manually from dashboard.
      }
    }
  }

  if (event.type === "subscription.canceled" || event.type === "subscription.revoked") {
    // Honor period-end grace: keep plan=pro until currentPeriodEnd, then getPlan() flips to free.
    const customer = event.data.customer;
    const md = (event.data.metadata ?? {}) as Record<string, string>;
    const u = await findUserForSubscription({ metadataUserId: md.userId, email: customer?.email });
    // No user is expected after account deletion (we revoke, then delete): a
    // downgrade for someone who no longer exists has nothing to apply.
    if (u) {
      const periodEnd = event.data.currentPeriodEnd ? new Date(event.data.currentPeriodEnd) : null;
      // subscription.revoked = immediate end (no grace). Otherwise honor grace until period end.
      const immediate = event.type === "subscription.revoked";
      const nextPlan: "pro" | "free" = !immediate && periodEnd && periodEnd > new Date() ? "pro" : "free";
      await db.update(userProfiles).set({
        plan: nextPlan,
        planExpiresAt: nextPlan === "pro" ? periodEnd : new Date(),
        subscriptionStatus: event.data.status,
        cancelAtPeriodEnd: immediate ? false : event.data.cancelAtPeriodEnd,
      }).where(eq(userProfiles.userId, u.id));
      await identifyServer({ profileId: u.id, properties: { plan: nextPlan } });
      await trackServer(
        { name: "subscription_canceled", props: { immediate } },
        { profileId: u.id },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
