import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { syncUserSubscriptionFromPolar, userIsAlreadyPro } from "@/lib/polar";

export const runtime = "nodejs";

/**
 * Self-heal endpoint: pulls the user's subscription from Polar API and reflects it
 * in our DB. Use case: webhook missed/delayed, user lands on /dashboard?welcome=1
 * and is still on free. Idempotent.
 */
export async function POST(): Promise<Response> {
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }

  // Cheap guard: if already Pro, no-op. Avoids hammering Polar's API on every reload.
  if (await userIsAlreadyPro(session.user.id)) {
    return NextResponse.json({ ok: true, plan: "pro", source: "cache" });
  }

  const result = await syncUserSubscriptionFromPolar({
    userId: session.user.id,
    email: session.user.email,
  });

  if (result.kind === "synced") {
    return NextResponse.json({ ok: true, plan: result.plan, planExpiresAt: result.planExpiresAt });
  }
  if (result.kind === "no_subscription") {
    return NextResponse.json({ ok: true, plan: "free", note: "no_subscription" });
  }
  return NextResponse.json({ ok: false, note: "polar_unavailable" }, { status: 503 });
}
