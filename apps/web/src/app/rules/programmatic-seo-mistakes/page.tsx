import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { CodeComparison } from "./code-comparison";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/rules/programmatic-seo-mistakes`;

export const metadata: Metadata = {
  title: "5 Programmatic SEO Mistakes to Avoid in 2026 · pseolint",
  description:
    "Avoid Google SpamBrain penalties and indexation drops. Read our visual developer guide on fixing duplicate templates, thin content, and schema gaps.",
  alternates: { canonical: url },
  openGraph: {
    title: "5 Programmatic SEO Mistakes to Avoid (Before/After Code)",
    description:
      "Google SGE and SpamBrain models filter out monotonous, low-value programmatic templates. Learn how to write compliant dynamic pages with visual code comparisons.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "5 Programmatic SEO Mistakes to Avoid (Before/After Code)",
    description:
      "Learn how to audit and fix duplicate templates, boilerplate ratios, and missing canonicals with visual code comparisons.",
  },
};

const MISTAKES = [
  {
    title: "1. The Entity-Swap Trap (Doorway Pages)",
    description:
      "Creating 10,000 pages where the only difference is a swapped city name or keyword token (e.g. 'Web development in Boston' vs 'Web development in Denver') is the easiest way to trigger a SpamBrain doorway-page penalty. Google expects genuine local entity details, address citations, or specialized data on each page.",
    severity: "Critical Error",
    remedy: "Inject unique local API data, named practitioners, custom price points, and localized guides.",
  },
  {
    title: "2. Missing self-referential canonical tags",
    description:
      "If you omit the canonical tag or mistakenly point all generated pages to the category root or homepage, Google will consolidate them. Googlebot will pick one representative URL, index it, and drop the remaining 99.9% of your pages under the 'Duplicate, Google chose different canonical' label.",
    severity: "Major Warning",
    remedy: "Always ensure every dynamic route returns a unique, self-referencing canonical URL.",
  },
  {
    title: "3. High Boilerplate-to-Content Ratio",
    description:
      "If 85% of your page's words live in the navigation bar, sidebars, related links, and the footer, what is left is not enough for Google to tell the URL apart from its siblings. There is no ranking requirement to hit here: Google documents no preferred word count. The 300-word figure pseolint uses is a spam-detection floor for pages generated in bulk, and below it a template is almost always shipping boilerplate with a swapped entity name.",
    severity: "Major Warning",
    remedy: "Keep boilerplate ratio under 60% by stripping filler blocks and expanding page-specific details.",
  },
  {
    title: "4. No Machine-Readable Structured Data (Schema)",
    description:
      "Search engine AI Overviews rely heavily on structured entities to formulate citations. If your pages lack Product, Article/TechArticle, or BreadcrumbList JSON-LD, you are missing out on rich results and AI recommendations. FAQPage and HowTo are not on that list any more: Google retired the HowTo rich result in September 2023 and the FAQ rich result on May 7, 2026, so question and step content earns its citation through visible structure, one question or step per heading with the answer directly beneath it.",
    severity: "Optimization Gap",
    remedy: "Inject valid nested JSON-LD objects matching the page's primary intent.",
  },
];

export default function MistakesPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "5 Programmatic SEO Mistakes to Avoid in 2026",
    description: "Visual developer guide illustrating code comparison blocks for compliant and non-compliant programmatic SEO configurations.",
    url,
    inLanguage: "en",
    about: { "@type": "Thing", name: "programmatic SEO mistakes" },
    isPartOf: {
      "@type": "WebSite",
      name: "pseolint",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "Ouranos Labs",
      url: SITE_URL,
    },
    author: {
      "@type": "Person",
      name: "Philippe Kam",
      jobTitle: "Lead SEO Engineer",
      knowsAbout: ["Search Engine Optimization", "Web Development", "TypeScript"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <nav className="text-xs text-muted-foreground">
        <Link href="/rules" className="hover:text-foreground hover:underline">
          Rules
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Programmatic SEO mistakes</span>
      </nav>

      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Developer Guide · Code Diffs
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Common Programmatic SEO Code Mistakes & Fixes
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Google SGE and core spam updates have raised the quality threshold for programmatic web pages.
          Monotonous layouts built only to catch long-tail search queries are demoted.
          Below is a guide illustrating common technical and structure-level mistakes, followed by before-and-after
          code blocks showing how to implement compliant Next.js, React, and HTML templates.
        </p>
      </section>

      {/* Code Diffs Interactive Section */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Visual Code Comparisons
        </h2>
        <CodeComparison />
      </section>

      {/* Common Mistakes Grid */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">
          Detailed Deficit Deep-Dive
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {MISTAKES.map((m, i) => (
            <div
              key={i}
              className="rounded-[22px] border border-border/70 bg-card/40 p-6 backdrop-blur-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-foreground">{m.title}</h3>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-destructive border border-destructive/40 bg-destructive/10 px-2 py-0.5 rounded-full">
                    {m.severity}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {m.description}
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-border/40 text-[11px] text-primary">
                <span className="font-semibold uppercase tracking-wider">Remedy:</span> {m.remedy}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sources Section */}
      <SourcesSection
        sources={[
          {
            source: "scaledContent",
            note: "Google's March 5, 2024 scaled content policies define the boundaries of doorway-like templates and high-volume near-duplicate layouts.",
          },
          {
            source: "canonicalization",
            note: "Google's canonicalization guidelines detail how crawler algorithms fold structurally similar URLs into a single representative index slot.",
          },
          {
            source: "helpfulContent",
            note: "Helpful content frameworks establish the 300-word standalone body floor and information density metrics targeted in our guide.",
          },
        ]}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
