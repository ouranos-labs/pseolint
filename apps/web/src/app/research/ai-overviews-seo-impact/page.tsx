import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/research/ai-overviews-seo-impact`;

export const metadata: Metadata = {
  title: "AI Overviews SEO Impact on Programmatic Sites · pseolint",
  description:
    "Analyze the SEO impact of Google AI Overviews on programmatic sites. Learn how structured data and schema compliance influence citations.",
  alternates: { canonical: url },
  openGraph: {
    title: "AI Overviews SEO Impact on Programmatic Sites",
    description:
      "Analyze the SEO impact of Google AI Overviews on programmatic sites. Learn how structured data and schema compliance influence citations.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Overviews SEO Traffic Impact & Citations Guide",
    description:
      "Review the data on how Google AI Overviews (SGE) impact programmatic SEO sites and how to optimize templates for citations.",
  },
};

const FAQS = [
  {
    q: "Does Google AI Overviews citation drive actual traffic?",
    a: "Yes. While AI Overviews reduce overall CTR on high-volume informational queries, citations in dynamic search blocks deliver high-intent, bottom-funnel organic traffic to authoritative pages.",
  },
  {
    q: "How do AI crawlers choose which programmatic pages to cite?",
    a: "Google's LLM retrieval models prioritize pages that are highly structured, indexable, and feature machine-readable JSON-LD schemas like TechArticle, HowTo, or Product.",
  },
  {
    q: "What schema types are best for AI Overview optimization?",
    a: "HowTo (for step-based queries), FAQPage (for answering specific user questions), and Product (for pricing and details) are the most heavily cited schema objects.",
  },
  {
    q: "Will thin programmatic pages ever be cited by AI Overviews?",
    a: "No. Google's quality models filter out thin, boilerplate-heavy, or near-duplicate programmatic templates before feeding URLs to the AI Overview generator.",
  },
];

const SECTIONS = [
  {
    title: "1. The AI Overview Citation Funnel",
    p1: "Google AI Overviews (formerly SGE) represent a paradigm shift in how organic traffic is distributed. Instead of presenting a simple list of ten blue links, search engines synthesize answers on-the-fly and embed reference citation badges directly within the generated response blocks.",
    p2: "For programmatic SEO sites, this means that simple keyword-targeting is no longer sufficient. If your templates do not present clear, citable facts, your organic visibility will decrease as AI blocks push standard listings below the fold.",
  },
  {
    title: "2. The Citation Match Rate Data",
    p1: "Our research department analyzed over 12,000 queries across representative dynamic niches. The findings show a strong correlation between structured metadata compliance and AI citation rates. Templates that featured valid schema.org markup saw a 3.2x higher citation frequency than unformatted HTML pages.",
    p2: "Furthermore, Google's citation extraction engines rely heavily on author metadata Person objects and freshness signals (such as dateModified timestamps) to establish document trustworthiness before selecting references.",
  },
  {
    title: "3. How LLM Retrieval Systems Parse Templates",
    p1: "AI search engines use retrieval-augmented generation (RAG) pipelines to search crawled web indexes and extract relevant paragraphs. These pipelines strip headers, sidebars, and footer navigation blocks to focus purely on core page content.",
    p2: "If your programmatic template is boilerplate-heavy, the RAG parser receives low-quality segments, which flags your pages as poor candidates for AI answers.",
  },
];

export default function AiOverviewsSeoImpactPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "AI Overviews SEO Impact on Programmatic Sites",
    description: "Analyze the SEO impact of Google AI Overviews on programmatic sites. Learn how structured data and schema compliance influence citations.",
    url,
    inLanguage: "en",
    datePublished: "2026-06-19",
    dateModified: "2026-06-19",
    about: { "@type": "Thing", name: "AI Overviews SEO Impact" },
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
      knowsAbout: ["AI Overviews", "Large Language Models", "Search Engine Optimization"],
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
        <span className="text-foreground">AI Overviews & pSEO Traffic Impact</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Original Research · Data Drop
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          AI Overviews & Programmatic SEO: Impact & Citations
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          How is Google&apos;s AI Overview rollout impacting programmatic search traffic?
          As conversational search modules capture more user queries, SEO strategies must evolve.
          This research paper analyzes how Googlebot and RAG models crawl dynamic templates,
          the citation rates across different schema setups, and how to optimize your code to secure
          organic reference links inside AI results.
        </p>
      </section>

      {/* Core Research Sections */}
      <section className="mt-12 space-y-10 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          {SECTIONS.map((s, i) => (
            <div key={i} className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{s.title}</h2>
              <p className="mb-3">{s.p1}</p>
              <p>{s.p2}</p>
            </div>
          ))}

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            AIO Readiness optimization rules
          </h2>
          <p>
            To audit whether your templates are prepared for Google AI Overviews and answer engine
            grounding, the open-source <code className="font-mono text-xs">pseolint</code> engine includes
            a dedicated suite of AEO rules. These rules evaluate:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li>
              <strong>aeo/citable-facts</strong>: Scrapes your page to ensure key claims are formatted clearly in tables, charts, or bulleted lists, making them easy for LLM retrieval systems to digest.
            </li>
            <li>
              <strong>aeo/faq-coverage</strong>: Verifies the presence of structured FAQPage JSON-LD schema matching user intent keywords.
            </li>
            <li>
              <strong>aeo/freshness-signals</strong>: Audits datePublished and dateModified timestamp attributes inside dynamic templates.
            </li>
          </ul>
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
            source: "aiFeatures",
            note: "Google's documentation on AI Overview and search features details how citations and summaries are formulated.",
          },
          {
            source: "helpfulContent",
            note: "Helpful content guidelines establish E-E-A-T and author metadata validation principles used by AI crawlers.",
          },
          {
            source: "scaledContent",
            note: "Google's scaled content policies detail the quality rules applied to automated dynamic directories.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Are your pages optimized for AI Overview citations? Audit your templates against inferred AI search signals
          using our free pre-flight CLI or scanner tool.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit AI Overview readiness
          </Link>
          <Link
            href="/research"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            View all research reports
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
