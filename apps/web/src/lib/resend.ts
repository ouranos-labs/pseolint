import { Resend } from "resend";
import { render } from "@react-email/render";
import { env } from "@/lib/env";
import MagicLinkEmail from "@/emails/MagicLinkEmail";
import OrchestratorCompleteEmail, {
  type OrchestratorCompleteEmailProps,
} from "@/emails/OrchestratorCompleteEmail";

const resend = new Resend(env().RESEND_API_KEY);

// Without a verified Resend domain, sends fail for any recipient except the
// Resend account owner. Log the URL so the operator can still sign in by
// copying it from server logs, then rethrow so Better Auth sees the failure.
function logSigninLink(to: string, url: string, reason: string): void {
  console.error(`[auth] magic-link delivery ${reason} for ${to}\n[auth] sign-in URL: ${url}`);
}

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    logSigninLink(to, url, "dev-mode log");
  }
  const html = await render(MagicLinkEmail({ url }));
  const { error } = await resend.emails.send({
    from: env().RESEND_FROM, to, subject: "Sign in to pseolint", html,
  });
  if (error) {
    logSigninLink(to, url, `failed: ${error.message}`);
    // In dev we've already logged the URL; swallow the error so Better Auth
    // returns 200 and the UI can show "check your email / terminal". In prod
    // we still throw so monitoring surfaces delivery failures.
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Resend failed: ${error.message}`);
    }
  }
}

/**
 * Notify a user that their orchestrator session finished. Best-effort: a
 * delivery failure logs but doesn't block the Inngest function from
 * marking the session terminal: the manifest is reachable from the
 * dashboard regardless.
 */
export async function sendOrchestratorCompleteEmail(
  to: string,
  props: OrchestratorCompleteEmailProps,
): Promise<void> {
  const html = await render(OrchestratorCompleteEmail(props));
  const { error } = await resend.emails.send({
    from: env().RESEND_FROM,
    to,
    subject: `pseolint manifest ready · ${props.domain}`,
    html,
  });
  if (error) {
    // Structured-args logging (not template-literal interpolation) avoids
    // CWE-134 format-string flags on user-derived recipient address.
    console.error("[orchestrator] email delivery failed", {
      to,
      reason: error.message,
      manifestUrl: props.manifestUrl,
    });
    // Never throw: email is a notification convenience, not the canonical
    // surface. The manifest is always reachable from /dashboard.
  }
}
