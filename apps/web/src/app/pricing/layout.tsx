import type { Metadata } from "next";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Pricing · pseolint",
  description:
    "pseolint pricing. Free unlimited one-shot audits up to 200 pages. Pro: monitored domains, daily diff-audits, fix queue, integrations.",
  alternates: { canonical: `${SITE_URL}/pricing` },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
