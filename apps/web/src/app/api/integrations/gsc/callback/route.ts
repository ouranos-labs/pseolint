import { NextResponse } from "next/server";
import { getOptionalSession } from "@/lib/session";
import { exchangeCodeForTokens, persistGscTokens, unpackState } from "@/lib/gsc";
import { auditLog } from "@/lib/audit-log";

export const runtime = "nodejs";

/**
 * OAuth callback — exchange the auth code for tokens, encrypt + persist, and
 * bounce the user back to the integrations page. Defends against:
 *   - state forgery (sealed with BETTER_AUTH_SECRET, ttl-checked)
 *   - cross-account replay (state is pinned to a userId, must match session)
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const back = (params: Record<string, string>) => {
    const u = new URL("/dashboard/integrations", url.origin);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return NextResponse.redirect(u);
  };

  if (oauthError) {
    auditLog("gsc.oauth.user_denied", { error: oauthError });
    return back({ gsc: "denied" });
  }
  if (!code || !state) return back({ gsc: "missing_params" });

  const session = await getOptionalSession();
  if (!session) return NextResponse.redirect(new URL("/signin?callbackUrl=/dashboard/integrations", url.origin));

  let stateUserId: string;
  try {
    stateUserId = unpackState(state).userId;
  } catch (e) {
    auditLog("gsc.oauth.state_invalid", { err: e instanceof Error ? e.message : String(e) });
    return back({ gsc: "state_invalid" });
  }
  if (stateUserId !== session.user.id) {
    auditLog("gsc.oauth.state_mismatch", { stateUserId, sessionUserId: session.user.id });
    return back({ gsc: "state_mismatch" });
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await persistGscTokens(session.user.id, tokens);
    auditLog("gsc.oauth.connected", { userId: session.user.id });
  } catch (e) {
    auditLog("gsc.oauth.exchange_failed", { err: e instanceof Error ? e.message : String(e) });
    return back({ gsc: "exchange_failed" });
  }
  return back({ gsc: "connected" });
}
