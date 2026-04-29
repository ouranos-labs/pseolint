import type { Metadata } from "next";
import { env } from "@/lib/env";
import PricingClient from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing — Free SpamBrain audits + Pro monitoring · pseolint",
  description:
    "Free unlimited one-shot audits. Pro at $19/month adds per-domain monitoring, weekly digests, GSC integration, and rule overrides. No credit card to start.",
  alternates: { canonical: `${env().BETTER_AUTH_URL}/pricing` },
};

export default function Pricing() {
  return <PricingClient />;
}
