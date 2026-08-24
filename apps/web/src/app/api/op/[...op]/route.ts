import { createRouteHandler } from "@openpanel/nextjs/server";
import { env } from "@/lib/env";

/**
 * Same-origin proxy for the self-hosted OpenPanel instance.
 *
 * Serves the SDK script at `/api/op/op1.js` and forwards events from
 * `/api/op/track*` to OPENPANEL_API_URL server-side (the handler also forwards
 * the end-user's IP via the `openpanel-client-ip` header so the cookieless
 * daily IP+UA hash is computed against the real visitor, not our server).
 *
 * Why proxy instead of pointing the browser straight at the instance:
 * - Genuinely first-party: everything loads from pseolint.dev (matches
 *   /privacy's "first-party, no third-party SDK" claim).
 * - Ad-blocker resistant (no request to a known analytics domain).
 * - CSP stays `'self'`: no external origin needed in script-src/connect-src.
 *
 * No-op safety: when OPENPANEL_API_URL is unset, the client provider never
 * renders (no clientId), so this route is never hit.
 */
export const runtime = "nodejs";

export const { GET, POST } = createRouteHandler({ apiUrl: env().OPENPANEL_API_URL });
