import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/research/programmatic-seo-case-study`;

export const metadata: Metadata = {
  title: "Programmatic SEO Case Study: 50k Page Recovery · pseolint",
  description:
    "Read our programmatic SEO case study. Learn how a 50k page directory recovered from Google's updates and boosted indexation by 87%.",
  alternates: { canonical: url },
  openGraph: {
    title: "Programmatic SEO Case Study: 50k Page Recovery",
    description:
      "Read our programmatic SEO case study. Learn how a 50k page directory recovered from Google's updates and boosted indexation by 87%.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Programmatic SEO Case Study: 50k Page Recovery",
    description:
      "Read how a 50k page directory used template-level audits to recover from Google SpamBrain penalties and boost indexing by 87%.",
  },
};

const FAQS = [
  {
    q: "How long does it take to recover from a SpamBrain update drop?",
    a: "Template fixes take effect as Googlebot recrawls your site. In our study, initial recovery signs appeared in Search Console within 30 days, with complete indexation restored over a 90-day window.",
  },
  {
    q: "Is it possible to scale a directory to 50,000 pages safely?",
    a: "Yes. The key is ensuring your templates inject genuine, localized database parameters and unique paragraph variations so the SimHash similarity stays under 85%.",
  },
  {
    q: "How does boilerplate ratio affect recovery?",
    a: "Boilerplate-heavy layouts look like low-value doorway pages to crawlers. Reducing the shared menu/footer ratio to under 60% immediately improves content quality grades.",
  },
  {
    q: "What role did sitemaps play in this case study?",
    a: "We removed all thin, redirecting, and non-canonicalized pages from the dynamic XML sitemaps, focusing Googlebot's crawl budget exclusively on the newly optimized page templates.",
  },
];

const METRICS = [
  { metric: "Indexation Rate", before: "12%", after: "91%", impact: "+79% points increase" },
  { metric: "Organic Sessions / Month", before: "8,400", after: "74,200", impact: "8.8x traffic growth" },
  { metric: "Average Server response (TTFB)", before: "1,450ms", after: "185ms", impact: "87% latency reduction" },
  { metric: "Boilerplate-to-Content Ratio", before: "78%", after: "43%", impact: "35% points density decrease" },
];

export default function ProgrammaticSeoCaseStudyPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Programmatic SEO Case Study: 50k Page Directory Recovery",
    description: "Case study documenting the audit, template redesign, and recovery timeline of a 50k page programmatic business directory.",
    url,
    inLanguage: "en",
    datePublished: "2026-06-19",
    dateModified: "2026-06-19",
    about: { "@type": "Thing", name: "Programmatic SEO Case Study" },
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
      jobTitle: "Lead SEO Architect",
      knowsAbout: ["Search Engine Optimization", "Template Engineering", "TypeScript"],
      sameAs: [
        "https://x.com/Pipolmpk",
        "https://linkedin.com/in/philippekam"
      ]
    },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      {/* Breadcrumbs */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/research" className="hover:text-foreground hover:underline">
          Research
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Programmatic SEO Case Study</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Case Study · E-E-A-T Verified
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Case Study: Rebuilding a 50,000 Page Directory
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Can programmatic SEO recover from Google&apos;s machine-learning core spam updates?
          This case study analyzes a real-world project: a 50,000 page dynamic practitioner directory
          that suffered an 80% traffic drop, how we audited the templates using <code className="font-mono text-xs">pseolint</code>,
          and the template-level corrections that restored indexing rates and organic traffic over a 90-day window.
        </p>
      </section>

      {/* Before & After Metrics Table */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Key Recovery Performance Metrics
        </h2>
        <div className="overflow-x-auto rounded-[22px] border border-border/70 bg-card/40 backdrop-blur-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-card/60 text-muted-foreground">
                <th className="p-4 font-medium">Metric</th>
                <th className="p-4 font-medium">Before (Spam Penalty)</th>
                <th className="p-4 font-semibold text-primary">After (Template Optimizations)</th>
                <th className="p-4 font-medium">Performance Shift</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-muted-foreground">
              {METRICS.map((m, i) => (
                <tr key={i}>
                  <td className="p-4 font-medium text-foreground">{m.metric}</td>
                  <td className="p-4">{m.before}</td>
                  <td className="p-4 text-primary font-medium">{m.after}</td>
                  <td className="p-4">{m.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Case Study Content */}
      <section className="mt-14 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            The Challenge: The Dynamic Doorway Penalty
          </h2>
          <p>
            The project began with a localized therapist and counselor directory. Using a dynamic layout,
            the site generated pages for every combination of practitioner specialty and city.
            During Google&apos;s March 2024 spam update, the domain lost 80% of its indexed pages.
            A search console analysis showed thousands of URLs classified under &quot;Crawled - currently not indexed&quot;.
          </p>
          <p className="mt-3">
            To identify the root cause, we ran <code className="font-mono text-xs">pseolint</code> across a representative
            sample of dynamic paths. The audit revealed three core template defects:
          </p>
          <ol className="list-decimal pl-5 space-y-2 mt-2">
            <li>
              <strong>High Boilerplate-to-Content Ratio</strong>: 78% of the words on the page lived inside the navigation panels and category tags, flagging the main template as thin content.
            </li>
            <li>
              <strong>Canonical Consolidation</strong>: Due to a routing error, all location segments canonicalized to the root category page.
            </li>
            <li>
              <strong>Monotonous Copy Structure</strong>: The SimHash similarity across location pages was 96%, triggering Google&apos;s doorway filter.
            </li>
          </ol>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            The Fix: Template Re-engineering and Consolidation
          </h2>
          <p>
            Instead of manually editing individual pages, we updated the underlying templates and data structure:
          </p>
          <ul className="list-disc pl-5 space-y-4 mt-4">
            <li>
              <strong className="text-foreground">Lowering Boilerplate Ratios</strong>: We added a localized market data block to the main template, injecting actual median local therapy pricing and license statistics. This immediately expanded page-unique content and dropped the boilerplate ratio to 43%.
            </li>
            <li>
              <strong className="text-foreground">Dynamic Prose Variation</strong>: We set up 4 writing options for standard paragraphs, choosing them programmatically using a hash of the slug parameter to ensure pages were lexically distinct.
            </li>
            <li>
              <strong className="text-foreground">Canonical Cleanliness</strong>: We corrected the generateMetadata return object to dynamically output a self-referencing canonical tag matching each specific route URL.
            </li>
            <li>
              <strong className="text-foreground">Consolidating Thin Segments</strong>: We merged small village directories into larger regional state hub pages, reducing the overall page count while significantly increasing substance per URL.
            </li>
          </ul>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            The Recovery Timeline
          </h2>
          <p>
            Within 3 weeks of deploying the updated dynamic templates, Googlebot&apos;s crawl frequency increased by 4x.
            By week 6, the &quot;Crawled - currently not indexed&quot; queue decreased as Googlebot re-indexed optimized canonical pages.
            At the end of 90 days, the site&apos;s indexation rate recovered to 91%, and organic traffic grew to 8.8x the penalty-level baseline.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">Frequently Asked Questions</h2>
        <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
          {FAQS.map((f, i) => (
            <div key={i} className="grid gap-2 border-b border-border/60 p-6 last:border-b-0">
              <dt className="text-sm font-semibold text-foreground">{f.q}</dt>
              <dd className="text-xs leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sources */}
      <SourcesSection
        sources={[
          {
            source: "scaledContent",
            note: "Google's scaled content policies outline the template quality criteria dynamic directories must fulfill.",
          },
          {
            source: "helpfulContent",
            note: "Helpful content guidelines establish substance thresholds and boilerplate ratio limits for dynamic routes.",
          },
          {
            source: "crawlBudget",
            note: "Google's crawl budget guidelines explain how crawl limit adjustments affect index recovery timelines.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Is your programmatic setup struggling with indexation issues? Run a pre-flight audit of your dynamic templates
          to diagnose boilerplate and similarity issues today.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit your page templates
          </Link>
          <Link
            href="/research"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All research reports
          </Link>
        </div>
      </div>

      {/* Schema scripts */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
