import { Resend } from "resend";
import { render } from "@react-email/render";
import { env } from "@/lib/env";
import MagicLinkEmail from "@/emails/MagicLinkEmail";

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
    // In dev we've already logged the URL — swallow the error so Better Auth
    // returns 200 and the UI can show "check your email / terminal". In prod
    // we still throw so monitoring surfaces delivery failures.
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Resend failed: ${error.message}`);
    }
  }
}
