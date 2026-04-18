import { Resend } from "resend";
import { render } from "@react-email/render";
import { env } from "@/lib/env";
import MagicLinkEmail from "@/emails/MagicLinkEmail";

const resend = new Resend(env().RESEND_API_KEY);

export async function sendMagicLinkEmail(to: string, url: string): Promise<void> {
  const html = await render(MagicLinkEmail({ url }));
  const { error } = await resend.emails.send({
    from: env().RESEND_FROM, to, subject: "Sign in to pseolint", html,
  });
  if (error) throw new Error(`Resend failed: ${error.message}`);
}
