import type { Metadata } from "next";
import { LandingForm } from "@/components/landing/landing-form";
import { LANDING_FAQ } from "@/lib/landing-faq";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "pseolint — audit your pSEO site by template, not by URL",
  description:
    "Open-source linter for programmatic SEO. v0.6 audits by template — find which template is dragging your score down. Free tier + $19/mo Pro monitoring.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "pseolint — template-aware programmatic SEO audit",
    description:
      "v0.6 audits by template. K=10 URLs sampled per template. Find the broken template before SpamBrain does.",
    type: "website",
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image" },
};

/**
 * Escape `</` so a JSON-LD string can't terminate the surrounding <script> early.
 * https://html.spec.whatwg.org/multipage/scripting.html#restrictions-for-contents-of-script-elements
 */
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, "<\\/");
}

const SOFTWARE_APPLICATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "pseolint",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "any",
  url: SITE_URL,
  offers: [
    { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
    { "@type": "Offer", name: "Pro", price: "19", priceCurrency: "USD" },
  ],
};

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: LANDING_FAQ.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: { "@type": "Answer", text: item.a },
  })),
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // Pre-sanitized: JSON.stringify + escape `</` per HTML spec
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(SOFTWARE_APPLICATION_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        // Pre-sanitized: JSON.stringify + escape `</` per HTML spec
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(FAQ_JSON_LD) }}
      />
      <LandingForm />
    </>
  );
}
