import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { createCheckoutSession } from "@/lib/polar";

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

  const productId = body.data.interval === "monthly" ? env().POLAR_MONTHLY_PRODUCT_ID : env().POLAR_YEARLY_PRODUCT_ID;
  if (!productId) {
    return NextResponse.json({ error: "billing_unavailable" }, { status: 503 });
  }
  const { url } = await createCheckoutSession({
    productId,
    customerEmail: session.user.email,
    successUrl: `${env().BETTER_AUTH_URL}/dashboard?welcome=1`,
    metadata: {
      userId: session.user.id,
      ...(body.data.intent ? { intent: body.data.intent } : {}),
      ...(body.data.auditSlug ? { auditSlug: body.data.auditSlug } : {}),
    },
  });
  return NextResponse.json({ url });
}
