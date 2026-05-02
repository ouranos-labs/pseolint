import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles, users, audits } from "@/db/schema";
import { env } from "@/lib/env";
import { rememberEventOnce, isActiveSubscriptionStatus } from "@/lib/polar";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import { ensureMonitoredDomainForUser } from "@/lib/monitoring";

// Email casing varies between BetterAuth (preserves what user typed) and Polar
// (often normalizes to lowercase). Compare with lower() on both sides so a payment
// from "Alice@x.com" still finds the user signed up as "alice@x.com".
async function findUserByEmailCi(email: string): Promise<{ id: string } | undefined> {
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return u;
}

export const runtime = "nodejs";

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
  if (
    event.type === "subscription.created" ||
    event.type === "subscription.updated" ||
    event.type === "subscription.active"
  ) {
    const customer = event.data.customer;
    const email = customer?.email;
    if (!email) return NextResponse.json({ error: "no email on event" }, { status: 400 });
    const u = await findUserByEmailCi(email);
    if (!u) return NextResponse.json({ ok: true, note: "user not yet signed up" });

    // active|trialing|past_due all keep the user on Pro until currentPeriodEnd;
    // past_due covers Polar's renewal-retry window (~7 days) so a transient card
    // failure doesn't immediately downgrade an active subscriber.
    const plan = isActiveSubscriptionStatus(event.data.status) ? "pro" : "free";
    const planExpiresAt = event.data.currentPeriodEnd ? new Date(event.data.currentPeriodEnd) : null;

    await db.insert(userProfiles).values({
      userId: u.id, polarCustomerId: customer.id,
      plan, planExpiresAt,
    }).onConflictDoUpdate({
      target: userProfiles.userId,
      set: { polarCustomerId: customer.id, plan, planExpiresAt },
    });
  }

  if (event.type === "subscription.created") {
    const md = (event.data.metadata ?? {}) as Record<string, string>;
    if (md.intent === "monitor" && md.auditSlug && md.userId) {
      try {
        const [audit] = await db
          .select({ sourceUrl: audits.sourceUrl, userId: audits.userId })
          .from(audits)
          .where(eq(audits.slug, md.auditSlug))
          .limit(1);
        if (audit && audit.userId === md.userId) {
          await ensureMonitoredDomainForUser(md.userId, audit.sourceUrl);
        } else {
          console.warn("[polar webhook] monitor-intent audit not found or userId mismatch", { auditSlug: md.auditSlug });
        }
      } catch (e) {
        console.error("[polar webhook] monitor-intent binding failed:", e);
        // Do not fail the webhook — user can add domain manually from dashboard.
      }
    }
  }

  if (event.type === "subscription.canceled" || event.type === "subscription.revoked") {
    // Honor period-end grace: keep plan=pro until currentPeriodEnd, then getPlan() flips to free.
    // Previously we left plan=pro but only updated planExpiresAt; without an explicit plan write,
    // users who upgraded in the same cycle wouldn't reflect their final expiry. Make this explicit.
    const customer = event.data.customer;
    const u = await findUserByEmailCi(customer.email);
    if (u) {
      const periodEnd = event.data.currentPeriodEnd ? new Date(event.data.currentPeriodEnd) : null;
      // subscription.revoked = immediate end (no grace). Otherwise honor grace until period end.
      const immediate = event.type === "subscription.revoked";
      if (!immediate && periodEnd && periodEnd > new Date()) {
        await db.update(userProfiles).set({
          plan: "pro",
          planExpiresAt: periodEnd,
        }).where(eq(userProfiles.userId, u.id));
      } else {
        await db.update(userProfiles).set({
          plan: "free",
          planExpiresAt: new Date(),
        }).where(eq(userProfiles.userId, u.id));
      }
    }
  }

  return NextResponse.json({ ok: true });
}
