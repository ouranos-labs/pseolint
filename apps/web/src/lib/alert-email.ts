import { Resend } from "resend";
import { render } from "@react-email/render";
import { env } from "@/lib/env";
import MonitoringAlertEmail from "@/emails/MonitoringAlertEmail";
import type { AuditSummary } from "@pseolint/core";

export type AlertEmailInput = {
  to: string;
  sourceUrl: string;
  previousScore: number | null;
  currentScore: number;
  newRuleIds: string[];
  currSummary: AuditSummary | null;
  /** Public slug for the report URL (e.g. nanoid). Use audit.slug, not audit.id. */
  reportSlug: string;
};

export async function sendMonitoringAlertEmail(input: AlertEmailInput): Promise<void> {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  const host = safeHost(input.sourceUrl);
  const newFindings = (input.currSummary?.findings ?? [])
    .filter((f) => input.newRuleIds.includes(f.ruleId))
    .map((f) => ({ ruleId: f.ruleId, severity: f.severity, message: f.message }));

  const html = await render(
    MonitoringAlertEmail({
      host,
      sourceUrl: input.sourceUrl,
      previousScore: input.previousScore,
      currentScore: input.currentScore,
      newFindings,
      reportUrl: `${base}/r/${input.reportSlug}`,
      dashboardUrl: `${base}/dashboard`,
    }),
  );

  const resend = new Resend(env().RESEND_API_KEY);
  const subject =
    input.previousScore != null && input.currentScore > input.previousScore
      ? `Risk ↑ ${input.previousScore} → ${input.currentScore} on ${host}`
      : `New findings detected on ${host}`;

  const { error } = await resend.emails.send({
    from: env().RESEND_FROM,
    to: input.to,
    subject,
    html,
  });
  if (error) throw new Error(`Resend failed: ${error.message}`);
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
