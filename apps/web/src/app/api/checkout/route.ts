import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { createCheckoutSession, userIsAlreadyPro } from "@/lib/polar";
import { trackServerAfter } from "@/lib/analytics/track.server";

export const runtime = "nodejs";
const Body = z.object({
  interval: z.enum(["monthly", "yearly"]),
  intent: z.enum(["monitor"]).nullish(),
  auditSlug: z.string().min(8).max(32).nullish(),
});

export async function POST(req: Request): Promise<Response> {
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  // A second checkout would start a second, independently billed subscription.
  if (await userIsAlreadyPro(session.user.id)) {
    return NextResponse.json({ error: "already_subscribed" }, { status: 409 });
  }

  const productId = body.data.interval === "monthly" ? env().POLAR_MONTHLY_PRODUCT_ID : env().POLAR_YEARLY_PRODUCT_ID;
  if (!productId) {
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  let url: string;
  try {
    ({ url } = await createCheckoutSession({
      productId,
      customerEmail: session.user.email,
      successUrl: `${base}/dashboard?welcome=1`,
      returnUrl: `${base}/pricing?checkout=cancelled`,
      // userId is how the webhook finds this user even if they pay with a different email.
      metadata: {
        userId: session.user.id,
        ...(body.data.intent ? { intent: body.data.intent } : {}),
        ...(body.data.auditSlug ? { auditSlug: body.data.auditSlug } : {}),
      },
    }));
  } catch (e) {
    console.error("[checkout] createCheckoutSession failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "checkout_failed" }, { status: 502 });
  }
  trackServerAfter(
    { name: "checkout_redirected", props: { interval: body.data.interval } },
    { profileId: session.user.id },
  );
  return NextResponse.json({ url });
}
