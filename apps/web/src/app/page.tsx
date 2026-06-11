import type { Metadata } from "next";
import { LandingForm } from "@/components/landing/landing-form";
import { LANDING_FAQ } from "@/lib/landing-faq";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "pseolint — catch the patterns that get pSEO sites deindexed",
  description:
    "Open-source linter for programmatic SEO. Paste a URL or gate it in CI — pseolint finds the doorway clusters, near-duplicates, and thin templates that trip SpamBrain, by template. Free tier + $19/mo Pro monitoring.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "pseolint — catch the patterns that get pSEO sites deindexed",
    description:
      "The open-source linter for programmatic SEO. Find the broken template before SpamBrain does — paste a URL or wire it into CI.",
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
