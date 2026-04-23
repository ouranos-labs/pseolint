import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles, users, audits } from "@/db/schema";
import { env } from "@/lib/env";
import { rememberEventOnce } from "@/lib/polar";
import { validateEvent } from "@polar-sh/sdk/webhooks";
import { ensureMonitoredDomainForUser } from "@/lib/monitoring";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  let event;
  try {
    event = validateEvent(rawBody, headers, env().POLAR_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // Polar uses standardwebhooks; the webhook-id header is the unique event identifier.
  const webhookId = headers["webhook-id"];
  if (!webhookId) return NextResponse.json({ error: "missing webhook-id" }, { status: 400 });

  const seen = await rememberEventOnce(webhookId);
  if (!seen) return NextResponse.json({ ok: true, duplicate: true });

  if (event.type === "subscription.created" || event.type === "subscription.updated") {
    const customer = event.data.customer;
    const email = customer?.email;
    if (!email) return NextResponse.json({ error: "no email on event" }, { status: 400 });
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (!u) return NextResponse.json({ ok: true, note: "user not yet signed up" });

    await db.insert(userProfiles).values({
      userId: u.id, polarCustomerId: customer.id,
      plan: event.data.status === "active" ? "pro" : "free",
      planExpiresAt: event.data.currentPeriodEnd ? new Date(event.data.currentPeriodEnd) : null,
    }).onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        polarCustomerId: customer.id,
        plan: event.data.status === "active" ? "pro" : "free",
        planExpiresAt: event.data.currentPeriodEnd ? new Date(event.data.currentPeriodEnd) : null,
      },
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
          console.warn("[webhook] monitor-intent audit not found or userId mismatch", { auditSlug: md.auditSlug });
        }
      } catch (e) {
        console.error("[webhook] monitor-intent binding failed:", e);
        // Do not fail the webhook — user can add domain manually from dashboard.
      }
    }
  }

  if (event.type === "subscription.canceled") {
    // Honor period-end grace: keep plan=pro until currentPeriodEnd, then getPlan() flips to free.
    // Previously we left plan=pro but only updated planExpiresAt; without an explicit plan write,
    // users who upgraded in the same cycle wouldn't reflect their final expiry. Make this explicit.
    const customer = event.data.customer;
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, customer.email)).limit(1);
    if (u) {
      const periodEnd = event.data.currentPeriodEnd ? new Date(event.data.currentPeriodEnd) : null;
      if (periodEnd && periodEnd > new Date()) {
        // Grace window: pro until period end.
        await db.update(userProfiles).set({
          plan: "pro",
          planExpiresAt: periodEnd,
        }).where(eq(userProfiles.userId, u.id));
      } else {
        // Period already over (edge case: late webhook or no period end): free immediately.
        await db.update(userProfiles).set({
          plan: "free",
          planExpiresAt: new Date(),
        }).where(eq(userProfiles.userId, u.id));
      }
    }
  }

  return NextResponse.json({ ok: true });
}
