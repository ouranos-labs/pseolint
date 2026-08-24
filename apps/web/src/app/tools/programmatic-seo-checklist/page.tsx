import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { InteractiveChecklist } from "./interactive-checklist";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/tools/programmatic-seo-checklist`;

export const metadata: Metadata = {
  title: "Complete Programmatic SEO Pre-Launch Checklist · pseolint",
  description:
    "Deploy programmatic SEO campaigns with confidence. Use our interactive pre-launch checklist to audit canonicals, thin content, and schema gaps.",
  alternates: { canonical: url },
  openGraph: {
    title: "Complete Programmatic SEO Pre-Launch Checklist",
    description:
      "A complete pre-launch checklist for programmatic SEO setups. Verify thin content, schema compliance, and canonical tags before publishing.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Programmatic SEO Pre-Launch Checklist",
    description:
      "Audit your templates for thin content, crawl budget leaks, and missing structured data with our interactive pre-launch checklist.",
  },
};

const FAQS = [
  {
    q: "What is the boilerplate ratio limit for programmatic pages?",
    a: "Google recommends keeping boilerplate text under 60% of the total word count on the page. If the sidebar, nav, and footers make up more than 60% of the content, search crawlers may identify your URLs as near-duplicates.",
  },
  {
    q: "Why is a self-referential canonical tag so important?",
    a: "Without a unique self-referencing canonical tag on every programmatic page, Googlebot will consolidate your pages, index only one representative URL, and drop the rest under the duplicate content label.",
  },
  {
    q: "How many internal links does a programmatic page need?",
    a: "Every programmatic page should have at least one inbound internal link from a hub or category page. Pages that exist only in the sitemap are considered orphan pages and are highly vulnerable to indexing drops.",
  },
  {
    q: "How often should I update the dateModified schema attribute?",
    a: "You should update the dateModified attribute programmatically whenever the underlying page data or template layout undergoes a meaningful update. Stale dates can negatively impact indexing and AI Overview citation visibility.",
  },
];

const CHECKLIST_STEPS = [
  {
    name: "Give each page enough of its own copy to be worth a URL",
    text: "Google publishes no preferred word count, so treat 300 words of page-unique body text (excluding shared menus and footers) as pseolint's spam-detection floor at template scale, not as a ranking requirement: a thousand near-identical 40-word pages is a doorway pattern, whereas one short page that answers its question is fine.",
  },
  {
    name: "Inject real-world entity databases",
    text: "Populate your pages with rich details, such as localized reviews, actual pricing, maps, or practitioner names, to avoid the entity-swap doorway trap.",
  },
  {
    name: "Keep boilerplate ratio under 60%",
    text: "Reduce the density of static menus, widget chrome, and related link clouds. Use pseolint to confirm boilerplate ratio compliance.",
  },
  {
    name: "Set self-referencing canonical URLs",
    text: "Check that rel=canonical on every route matches its specific path parameter to prevent search engines from merging sibling templates.",
  },
  {
    name: "Audit robots.txt directives",
    text: "Ensure you do not accidentally index staging paths or block production paths. Avoid robots: { index: false } on live routes.",
  },
  {
    name: "Validate sitemap indexability",
    text: "Verify that your sitemap only lists 200-status, indexable pages. Remove any thin or canonicalized URLs from the dynamic sitemap.",
  },
  {
    name: "Establish inbound internal linking",
    text: "Set up hierarchical hub pages, category nodes, or dynamic inter-linking lists so no programmatic URL is left as an orphan segment.",
  },
  {
    name: "Add valid JSON-LD metadata",
    text: "Include intent-matching schemas that still render (Product, Article/TechArticle, BreadcrumbList) directly in the document template for rich results and AIO indexing; FAQPage and HowTo were retired by Google and earn nothing.",
  },
  {
    name: "Declare author entities",
    text: "Ensure the Article or WebPage schema features an Author Person block to establish trust and satisfy E-E-A-T signals.",
  },
  {
    name: "Give every page a unique, specific title",
    text: "Google documents no title-length limit; SERP cropping is display-side and pixel-based. What triggers a rewritten title is a quality problem: a half-empty template field, boilerplate repeated across the cluster, or a stale year. Front-load what makes THIS record different.",
  },
  {
    name: "Give every page its own meta description",
    text: "Google documents no character limit; snippets are truncated to the device width at display time. The real failures are a missing description (Google writes the snippet for you) and one templated description repeated across thousands of records.",
  },
  {
    name: "Provide freshness timestamps",
    text: "Inject datePublished and dateModified attributes in your structured metadata to signals content fresh status to search index engines.",
  },
];

export default function ProgrammaticSeoChecklistPage() {
  const webAppLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "pseolint Pre-launch Checklist",
    operatingSystem: "All",
    applicationCategory: "SEOTool",
    browserRequirements: "Requires JavaScript. Requires HTML5.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      {/* Breadcrumbs */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/tools" className="hover:text-foreground hover:underline">
          Tools
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Programmatic SEO checklist</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Interactive Web Tool · Evergreen Checklist
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          The Complete Programmatic SEO Pre-Launch Checklist
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Before launching a dynamic programmatic website with thousands of automatically generated pages,
          it is vital to run a comprehensive pre-flight audit. Google&apos;s machine-learning spam algorithms
          constantly crawl the web looking for unoriginal, thin, or duplicate content layouts.
          Use our interactive, localStorage-persisted pre-launch checklist to make sure your templates are
          perfectly optimized and compliant with modern search guidelines.
        </p>
      </section>

      {/* Interactive Checklist Component */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Pre-Launch Checklist
        </h2>
        <InteractiveChecklist />
      </section>

      {/* Deep-Dive Guide Content */}
      <section className="mt-14 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Why Standard Crawlers Fail to Catch Programmatic SEO Errors
          </h2>
          <p>
            Traditional site crawlers (like Screaming Frog or Sitebulb) are designed to audit static paths or
            crawl single page variations. They often miss scale-wide patterns.
            For instance, a standard crawler might report that every page on your site has a canonical tag,
            but it won&apos;t notify you if they all accidentally canonicalize to the home directory.
            Similarly, a standard crawler won&apos;t detect if 90% of the text across your 10,000 location pages
            is exact duplicate boilerplate text.
          </p>
          <p className="mt-3">
            To build a robust programmatic SEO pipeline, you must analyze your site at the template level.
            This checklist is broken down into four core categories designed to identify template-wide errors
            before they result in indexing drops:
          </p>

          <h3 className="text-base font-semibold text-foreground mt-6 mb-2">1. Data & Content Quality</h3>
          <p>
            Google&apos;s March 2024 core update targeted unoriginal content generated at scale. Sibling pages must
            not look like a simple mail-merge template. Note what this is not: Google states plainly that it has no
            preferred word count, so the 300-word figure below is pseolint&apos;s spam-detection floor for pages
            generated in bulk, not a ranking threshold. Below it, at template scale, a page rarely carries enough
            page-unique copy to distinguish it from its siblings. Back that copy with real entity data (localized
            metrics, practitioner names, or real reviews) rather than padding it to hit a number.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">2. Technical SEO Compliance</h3>
          <p>
            Dynamic pages are fragile. An incorrect canonical config or a stray robots noindex meta tag can
            instantly drop thousands of pages from search results. Make sure your sitemap lists only indexable,
            live URLs, and avoid orphan routes by establishing hierarchical internal linking structures.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3. Structured Data Integrity</h3>
          <p>
            Modern search engines use schema.org structures to answer queries directly in AI search interfaces.
            Ensure you include valid JSON-LD schemas matching the template intent. Additionally, declare
            explicit author person tags to prove original expertise and authority.
          </p>

          <h3 className="text-base font-semibold text-foreground mt-4 mb-2">4. Metadata Excellence</h3>
          <p>
            Ensure every page computes a unique title and meta description from the record&apos;s own fields.
            Neither has a documented character limit: truncation in the SERP is display-side cropping, not an
            indexing event. Uniqueness and specificity are what actually move the needle, so spend the effort
            there instead of on a character counter.
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
            note: "Google's scaled content abuse rules require all automated pages to demonstrate standalone original research.",
          },
          {
            source: "helpfulContent",
            note: "Google's helpful content guidelines outline the framework for establishing template substance and word counts.",
          },
          {
            source: "schemaOrg",
            note: "Schema.org standard configurations provide definitions for structured data objects used by search parsers.",
          },
          {
            source: "robotsIntro",
            note: "Google's introduction to robots.txt explains how crawlers parse indexing and noindex instructions.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Running a programmatic SEO campaign without pre-flight checking is like compiling code without linting.
          Use our open-source tool to identify optimization gaps on your dynamic paths in seconds.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Run pre-launch scan
          </Link>
          <Link
            href="/tools"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            View all tools
          </Link>
        </div>
      </div>

      {/* Schema scripts */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
