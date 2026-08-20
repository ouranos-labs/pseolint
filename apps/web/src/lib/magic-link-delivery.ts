import "server-only";
import { APIError } from "better-auth/api";
import { sendMagicLinkEmail } from "@/lib/resend";

/**
 * Send the magic-link email, mapping any delivery failure to a clean,
 * user-facing 502 (BAD_GATEWAY) instead of letting it surface as an opaque
 * 500 "Internal Server Error".
 *
 * Why this exists: a delivery failure (e.g. an unverified Resend `from`
 * domain) is an *upstream* problem, not a bug in our handler. Returning 500
 * conflates the two and shows the user a scary, dead-end error. We still
 * surface the failure (never a fake 200: the email genuinely didn't send),
 * but with an accurate status and an actionable message. The detailed reason
 * is already logged server-side by `sendMagicLinkEmail` for monitoring.
 */
export async function deliverMagicLink(email: string, url: string): Promise<void> {
  try {
    await sendMagicLinkEmail(email, url);
  } catch {
    throw new APIError("BAD_GATEWAY", {
      message:
        "We couldn't send your sign-in email right now. Try again in a moment, or sign in with Google.",
    });
  }
}
