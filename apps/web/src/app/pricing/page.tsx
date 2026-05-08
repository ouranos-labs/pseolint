import type { Metadata } from "next";
import { env } from "@/lib/env";
import PricingClient from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing — Free SpamBrain audits + Pro monitoring · pseolint",
  description:
    "Free unlimited one-shot audits with per-template verdicts (K=10 per template). Pro at $19/month adds K=20 re-audits, template_degraded monitoring alerts, AI triage, GSC integration, and rule overrides. No credit card to start.",
  alternates: { canonical: `${env().BETTER_AUTH_URL}/pricing` },
};

export default function Pricing() {
  return <PricingClient />;
}
