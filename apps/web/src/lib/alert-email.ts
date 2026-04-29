import { Resend } from "resend";
import { render } from "@react-email/render";
import { env } from "@/lib/env";
import MonitoringAlertEmail from "@/emails/MonitoringAlertEmail";
import type { AuditSummary } from "@pseolint/core";

export type AlertEmailInput = {
  to: string;
  sourceUrl: string;
  previousRisk: number | null;
  currentRisk: number;
  newRuleIds: string[];
  currSummary: AuditSummary | null;
  /** Public slug for the report URL (e.g. nanoid). Use audit.slug, not audit.id. */
  reportSlug: string;
};

export async function sendMonitoringAlertEmail(input: AlertEmailInput): Promise<void> {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  const host = safeHost(input.sourceUrl);
  const allFindings = input.currSummary
    ? [
        ...input.currSummary.issues.blockers,
        ...input.currSummary.issues.shouldFix,
        ...input.currSummary.issues.informational,
      ]
    : [];
  const newFindings = allFindings
    .filter((f) => input.newRuleIds.includes(f.ruleId))
    .map((f) => ({ ruleId: f.ruleId, severity: f.severity, message: f.message }));

  const html = await render(
    MonitoringAlertEmail({
      host,
      sourceUrl: input.sourceUrl,
      previousRisk: input.previousRisk,
      currentRisk: input.currentRisk,
      newFindings,
      reportUrl: `${base}/r/${input.reportSlug}`,
      dashboardUrl: `${base}/dashboard`,
    }),
  );

  const resend = new Resend(env().RESEND_API_KEY);
  const subject =
    input.previousRisk != null && input.currentRisk > input.previousRisk
      ? `Risk ↑ ${input.previousRisk} → ${input.currentRisk} on ${host}`
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
