import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { requireSession } from "@/lib/session";
import { createCheckoutSession } from "@/lib/polar";

export const runtime = "nodejs";
const Body = z.object({ interval: z.enum(["monthly", "yearly"]) });

export async function POST(req: Request): Promise<Response> {
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const productId = body.data.interval === "monthly" ? env().POLAR_MONTHLY_PRODUCT_ID : env().POLAR_YEARLY_PRODUCT_ID;
  const { url } = await createCheckoutSession({
    productId, customerEmail: session.user.email, successUrl: `${env().BETTER_AUTH_URL}/?upgraded=1`,
  });
  return NextResponse.json({ url });
}
