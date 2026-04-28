import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { buildAuthorizeUrl, gscOAuthConfig, packState } from "@/lib/gsc";

export const runtime = "nodejs";

/**
 * Initiate the GSC OAuth flow. Signed-in users only — we pin the state token
 * to the current user so the callback can't be replayed against a different
 * account.
 */
export async function GET(): Promise<Response> {
  const session = await getOptionalSession();
  if (!session) {
    return NextResponse.redirect(
      new URL("/signin?callbackUrl=/dashboard/integrations", process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
    );
  }
  try {
    gscOAuthConfig(); // validate env up-front
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "GSC misconfigured", { status: 500 });
  }
  const state = packState(session.user.id);
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
