import type { Metadata } from "next";
import { env } from "@/lib/env";
import PricingClient from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing — Free SpamBrain audits + Pro monitoring · pseolint",
  description:
    "Free unlimited audits, up to 200 pages stratified across templates. Pro 19 USD/mo: up to 500-page re-audits, monitoring, AI triage, GSC, rule overrides. No credit card.",
  alternates: { canonical: `${env().BETTER_AUTH_URL}/pricing` },
};

export default function Pricing() {
  return <PricingClient />;
}
