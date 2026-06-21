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

  const [profile] = await db
    .select({ polarCustomerId: userProfiles.polarCustomerId })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);

  if (!profile?.polarCustomerId) {
    return NextResponse.redirect(new URL("/pricing", new URL(env().BETTER_AUTH_URL)), 303);
  }

  const url = await createCustomerPortalUrl(profile.polarCustomerId);
  return NextResponse.redirect(url, 303);
}
