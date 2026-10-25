import type { Metadata } from "next";
import { env } from "@/lib/env";
import { getOptionalSession } from "@/lib/session";
import { getBillingState } from "@/lib/plan";
import { billingNotice } from "@/lib/billing-notice";
import { formatDate } from "@/lib/format";
import { DAILY_AUDIT_CAP, PAGE_CAP, PRO_REAUDIT_SAMPLE_SIZE } from "@/lib/audit-limits";
import { MAX_PRO_DOMAINS } from "@/lib/tier-limits";
import PricingClient, { type PricingViewer } from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing: Free SpamBrain audits + Pro monitoring · pseolint",
  description:
    `Free audits, ${DAILY_AUDIT_CAP.free} a day, up to ${PAGE_CAP.free} pages stratified across templates. Pro 19 USD/mo: up to ${PRO_REAUDIT_SAMPLE_SIZE}-page re-audits, monitoring for up to ${MAX_PRO_DOMAINS} domains, AI triage, GSC, rule overrides. No credit card.`,
  alternates: { canonical: `${env().BETTER_AUTH_URL}/pricing` },
};

export default async function Pricing() {
  // Read the plan server-side so a Pro viewer is never offered a second
  // subscription. Anonymous viewers get the plain page.
  let viewer: PricingViewer = { plan: "anon" };
  const session = await getOptionalSession();
  if (session) {
    const state = await getBillingState(session.user.id);
    const notice = billingNotice(state);
    viewer =
      state.plan === "pro"
        ? {
            plan: "pro",
            dateLine:
              notice.kind === "none" || !notice.date ? null
              : notice.kind === "canceling" ? `ends ${formatDate(notice.date)}`
              : notice.kind === "past_due" ? `payment failed, update your card by ${formatDate(notice.date)}`
              : `renews ${formatDate(notice.date)}`,
          }
        : { plan: "free" };
  }
  return <PricingClient viewer={viewer} />;
}
