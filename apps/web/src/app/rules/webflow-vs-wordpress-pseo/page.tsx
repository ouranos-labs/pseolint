import type { Metadata } from "next";
import Link from "next/link";
import { SCORED_RULE_COUNT } from "@pseolint/core/rules/scope";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/rules/webflow-vs-wordpress-pseo`;

export const metadata: Metadata = {
  title: "Webflow vs WordPress for Programmatic SEO · pseolint",
  description:
    "Compare Webflow vs WordPress for programmatic SEO. Discover collection limits, sync tools, database performance issues, and custom solutions.",
  alternates: { canonical: url },
  openGraph: {
    title: "Webflow vs WordPress for Programmatic SEO Sites",
    description:
      "Compare Webflow vs WordPress for programmatic SEO. Discover collection limits, sync tools, database performance issues, and custom solutions.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Webflow vs WordPress for Programmatic SEO",
    description:
      "Compare Webflow vs WordPress limitations, database scaling, API sync tools, and indexing risks for programmatic setups.",
  },
};

const FAQS = [
  {
    q: "What is the CMS collection item limit in Webflow?",
    a: "Webflow limits CMS collections to 10,000 items on standard Business hosting plans. Going beyond this limit requires upgrading to enterprise hosting tiers, which can be extremely expensive.",
  },
  {
    q: "How does WordPress handle large programmatic databases?",
    a: "WordPress can store hundreds of thousands of pages in its MySQL database. However, without aggressive server caching, database optimization, and high-performance hosting, page load speeds will slow down dramatically.",
  },
  {
    q: "What is the role of sync tools like Whalesync or Make?",
    a: "No-code databases (like Airtable or Notion) use sync tools to push rows into Webflow or WordPress CMS. While useful, they add significant subscription costs and sync delays.",
  },
  {
    q: "Why is a custom self-hosted framework better for programmatic SEO?",
    a: "Self-hosted frameworks (Next.js, Astro) have no page limits or CMS subscription sync fees. They render pages as static files on Edge networks, providing sub-200ms loads and perfect crawl conditions.",
  },
];

const COMPARISONS = [
  {
    platform: "Webflow",
    limit: "10,000 CMS items max (without Enterprise plan)",
    speed: "Excellent (globally cached CDN)",
    cost: "High ($39-$49/mo + sync subscription fees)",
    verdict: "Best for small-scale projects (<10k pages) needing fast design iterations.",
  },
  {
    platform: "WordPress",
    limit: "Unlimited (restricted only by server storage)",
    speed: "Slows down without database indexing & caching",
    cost: "Low ($10-$30/mo hosting, no item sync fees)",
    verdict: "Good for medium-scale projects, but requires high server management.",
  },
  {
    platform: "Custom (Next.js / Astro)",
    limit: "Unlimited (millions of pages on flat serverless DBs)",
    speed: "Lightning fast (sub-200ms static compilation)",
    cost: "Very low ($10-$15/mo database fee, hosting is free on Vercel)",
    verdict: "The developer standard for large-scale, high-performance programmatic SEO.",
  },
];

export default function WebflowVsWordpressPseoPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Webflow vs WordPress for Programmatic SEO",
    description: "Compare Webflow vs WordPress for programmatic SEO. Discover collection limits, sync tools, database performance issues, and custom solutions.",
    url,
    inLanguage: "en",
    about: { "@type": "Thing", name: "Webflow vs WordPress Programmatic SEO" },
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
      knowsAbout: ["Search Engine Optimization", "Template Engineering", "Web Crawlers"],
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
        <Link href="/rules" className="hover:text-foreground hover:underline">
          Rules
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Webflow vs WordPress for pSEO</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Platform Comparison · No-Code vs Custom
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Webflow vs WordPress for Programmatic SEO: Limits & Scaling
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          When launching a programmatic SEO campaign, choosing the correct backend and CMS architecture determines
          your scale limits, monthly database costs, and indexing speeds.
          While no-code solutions like Webflow and WordPress provide quick setup paths, they introduce critical
          technical bottlenecks that can throttle large directories.
          Below is a detailed comparison of limits, synchronization setups, and how pre-flight lints with
          <code className="font-mono text-xs">pseolint</code> prevent platform penalties.
        </p>
      </section>

      {/* Comparison Table */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Platform Feature Matrix
        </h2>
        <div className="overflow-x-auto rounded-[22px] border border-border/70 bg-card/40 backdrop-blur-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-card/60 text-muted-foreground">
                <th className="p-4 font-medium">Platform</th>
                <th className="p-4 font-medium">Scale Limit</th>
                <th className="p-4 font-medium">Speed Profile</th>
                <th className="p-4 font-medium">Monthly Cost</th>
                <th className="p-4 font-semibold text-foreground">Verdict</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-muted-foreground">
              {COMPARISONS.map((c, i) => (
                <tr key={i}>
                  <td className="p-4 font-semibold text-foreground">{c.platform}</td>
                  <td className="p-4">{c.limit}</td>
                  <td className="p-4">{c.speed}</td>
                  <td className="p-4">{c.cost}</td>
                  <td className="p-4 text-primary font-medium">{c.verdict}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* In-Depth Technical Content */}
      <section className="mt-14 space-y-8 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            The Webflow Constraint: Collection Limits and Sync Costs
          </h2>
          <p>
            Webflow is popular among design teams because of its visual editor. However, for programmatic campaigns,
            its database architecture introduces strict limitations. A standard Webflow plan caps total CMS items at
            10,000. If you are generating location directories or product comparisons, you will hit this limit quickly.
          </p>
          <p className="mt-3">
            Furthermore, you must sync data from external databases (like Airtable or Notion) using sync scripts
            (Whalesync, Make, or custom APIs). This creates a three-tier pricing model: paying for Webflow, paying for
            the sync connector, and paying for database hosting. If a template error triggers duplicate URLs, you end
            up paying for credit updates that Googlebot flags as thin content.
          </p>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            The WordPress Constraint: Database Queries and Caching Bloat
          </h2>
          <p>
            WordPress has no built-in page count limits. It can store 100,000 custom post types in its MySQL tables.
            However, WordPress relies heavily on dynamic database queries to render pages. When multiple search crawlers
            (Googlebot, Bingbot, and AI retrieval agents) index your site simultaneously, the server must process
            thousands of SQL calls per minute.
          </p>
          <p className="mt-3">
            Without high-performance hosting, database indexing, and aggressive caching setups, your server response
            times (TTFB) will exceed 1,500ms, causing Googlebot to dial back its crawl budget.
          </p>

          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-10">
            Why Pre-flight Auditing is Critical for No-Code Systems
          </h2>
          <p>
            Whether you use Webflow, WordPress, or a custom Next.js system, template errors are extremely costly.
            If a template has a broken canonical tag, Google consolidates your directories and drops them from search results.
            Before pushing updates, run <code className="font-mono text-xs">pseolint</code> in your staging or build environment to check:
          </p>
          <ul className="list-disc pl-5 space-y-2 mt-2">
            <li><strong>Boilerplate Ratios:</strong> Confirm shared menus do not crowd out unique page text.</li>
            <li><strong>Canonical Tags:</strong> Verify every route generates a self-referential canonical URL alternates block.</li>
            <li><strong>JSON-LD Schema:</strong> Validate structural schema.org markup before syncing to CMS databases.</li>
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
            source: "scaledContent",
            note: "Google's scaled content guidelines emphasize that automation platforms must focus on unique value and fast rendering speeds.",
          },
          {
            source: "crawlBudget",
            note: "Google's crawl budget guidelines outline how server response times impact crawl concurrency limits.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Are your CMS templates ready for large-scale crawling? Audit your site against {SCORED_RULE_COUNT} inferred SpamBrain signals
          using our free pre-flight linter.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit CMS templates
          </Link>
          <Link
            href="/rules"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All rules guides
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
