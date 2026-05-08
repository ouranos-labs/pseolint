import type { Metadata } from "next";
import { env } from "@/lib/env";
import PricingClient from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing — Free SpamBrain audits + Pro monitoring · pseolint",
  description:
    "Free unlimited audits with K=10 per template. Pro 19 USD/mo: K=20 re-audits, monitoring, AI triage, GSC, rule overrides. No credit card.",
  alternates: { canonical: `${env().BETTER_AUTH_URL}/pricing` },
};

export default function Pricing() {
  return <PricingClient />;
}
