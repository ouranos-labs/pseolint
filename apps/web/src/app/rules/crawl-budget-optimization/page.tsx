import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/rules/crawl-budget-optimization`;

export const metadata: Metadata = {
  title: "Crawl Budget Optimization for Programmatic SEO · pseolint",
  description:
    "Optimize your Google crawl budget for large-scale programmatic SEO sites. Discover how to eliminate indexing delays and template-wide bloat.",
  alternates: { canonical: url },
  openGraph: {
    title: "Crawl Budget Optimization for Programmatic SEO Sites",
    description:
      "Optimize your Google crawl budget for large-scale programmatic SEO sites. Discover how to eliminate indexing delays and template-wide bloat.",
    url,
    type: "article",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Google Crawl Budget Optimization Guide",
    description:
      "Discover the 5 major crawl budget killers on programmatic SEO sites and how to fix them to speed up Googlebot indexing.",
  },
};

const FAQS = [
  {
    q: "What is Google crawl budget?",
    a: "Crawl budget is the number of URLs Googlebot can and wants to crawl on your site within a given timeframe. It is determined by your server's host load limit and Google's crawl demand signals.",
  },
  {
    q: "How does thin content affect crawl budget?",
    a: "If Googlebot encounters thousands of low-value, thin-content pages, it reduces its crawl demand for your domain. This causes Googlebot to crawl your site less frequently, leading to severe indexing delays for new pages.",
  },
  {
    q: "Should I include redirecting URLs in my sitemap?",
    a: "No. Sitemaps must only contain 200-status, indexable canonical URLs. Declaring redirects or 404 pages in sitemaps wastes crawl budget and damages sitemap trust.",
  },
  {
    q: "How does page speed impact Google's crawl rate?",
    a: "If your server responds slowly (high Time to First Byte) or crashes under high crawler concurrency, Googlebot automatically dials back its crawl rate to prevent your server from going offline, limiting your budget.",
  },
];

const KILLERS = [
  {
    title: "1. Sitemap Bloat & Dead URLs",
    description:
      "Including redirected, canonicalized, or 404 URLs in your dynamic sitemaps forces Googlebot to spend its allocation on non-indexable routes.",
    remedy: "Filter sitemaps to include only 200-status canonical pages. Checked by rule: tech/sitemap-bloat.",
  },
  {
    title: "2. Endless Redirect Chains",
    description:
      "Redirect hops consume multiple crawler cycles. If Googlebot has to follow 3 or 4 redirects to reach a destination, it may abandon the path entirely.",
    remedy: "Eliminate redirect hops and point internal links directly to final destination URLs. Checked by rule: tech/redirect-chain.",
  },
  {
    title: "3. Flat Link Architecture & Orphan Pages",
    description:
      "Pages only discoverable via sitemaps are crawled less frequently. Googlebot prioritizes URLs linked from high-authority hub and category pages.",
    remedy: "Build dynamic inter-linking lists and category index templates to pass link equity. Checked by rule: links/link-depth.",
  },
  {
    title: "4. Faceted Navigation Parameter Explosion",
    description:
      "Dynamic filtering (e.g., sorting by price, color, and location simultaneously) creates millions of URL variations that Googlebot tries to index.",
    remedy: "Use robots.txt Disallow directives or clean canonical tags to block parameter permutations. Checked by rule: tech/canonical-consistency.",
  },
  {
    title: "5. Slow Server Response Times",
    description:
      "If your API database queries are slow, Googlebot limits crawler concurrency to protect your host, leaving thousands of pages uncrawled.",
    remedy: "Implement dynamic Edge caching and optimize server-side database index configurations. Checked by rule: tech/ttfb-limit.",
  },
];

export default function CrawlBudgetOptimizationPage() {
  const articleLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Crawl Budget Optimization for Programmatic SEO",
    description: "Optimize your Google crawl budget for large-scale programmatic SEO sites. Discover how to eliminate indexing delays and template-wide bloat.",
    url,
    inLanguage: "en",
    about: { "@type": "Thing", name: "Crawl Budget Optimization" },
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
      name: "pseolint Engineering",
      jobTitle: "Lead SEO Engineer",
      knowsAbout: ["Crawl Budget", "Web Architecutre", "Google Bot"],
    },
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      {/* Breadcrumbs */}
      <nav className="text-xs text-muted-foreground">
        <Link href="/rules" className="hover:text-foreground hover:underline">
          Rules
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Crawl budget optimization</span>
      </nav>

      {/* Hero */}
      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          Technical Guide · Crawling & Indexation
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Google Crawl Budget Optimization at Scale
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          If your programmatic SEO site spans 10,000 to over 100,000 URLs, crawl budget is your most critical constraint.
          Googlebot does not have infinite resources. If your website wastes its allocated crawl cycles on broken,
          duplicate, or slow-loading paths, Googlebot will stop crawling before discovering your key landing pages.
          This leads to long indexing queues and rising numbers of URLs in the &quot;Discovered - currently not indexed&quot;
          report in Google Search Console.
        </p>
      </section>

      {/* Crawl Budget Optimization Data Table */}
      <section className="mt-10">
        <h2 className="text-base font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Before & After Optimization Comparison
        </h2>
        <div className="overflow-x-auto rounded-[22px] border border-border/70 bg-card/40 backdrop-blur-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-card/60 text-muted-foreground">
                <th className="p-4 font-medium">Metric</th>
                <th className="p-4 font-medium">Unoptimized State</th>
                <th className="p-4 font-semibold text-primary">Optimized State</th>
                <th className="p-4 font-medium">Resulting Impact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40 text-muted-foreground">
              <tr>
                <td className="p-4 font-medium text-foreground">Sitemap Hygiene</td>
                <td className="p-4">Includes redirects & dynamic filters</td>
                <td className="p-4 text-primary font-medium">Only clean 200-status canonicals</td>
                <td className="p-4">100% crawl cycles focused on indexable pages</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">Redirect Strategy</td>
                <td className="p-4">Dynamic hops & category homepages</td>
                <td className="p-4 text-primary font-medium">Direct linking to target templates</td>
                <td className="p-4">Eliminates redirect loop dropouts</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">Link Depth</td>
                <td className="p-4">Flat list, relies purely on sitemap</td>
                <td className="p-4 text-primary font-medium">Category tree nodes (depth &lt; 4)</td>
                <td className="p-4">Googlebot indexes new pages within 48 hours</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">Server TTFB</td>
                <td className="p-4">Dynamic rendering (TTFB &gt; 1200ms)</td>
                <td className="p-4 text-primary font-medium">Static params + Edge cache (&lt; 200ms)</td>
                <td className="p-4">Googlebot increases crawl frequency by 4x</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* Five Killers Grid */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">
          The 5 Crawl Budget Killers on Programmatic Sites
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          {KILLERS.map((k, i) => (
            <div
              key={i}
              className="rounded-[22px] border border-border/70 bg-card/40 p-6 backdrop-blur-sm flex flex-col justify-between"
            >
              <div>
                <h3 className="text-sm font-bold text-foreground">{k.title}</h3>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  {k.description}
                </p>
              </div>
              <div className="mt-5 pt-4 border-t border-border/40 text-[11px] text-primary">
                <span className="font-semibold uppercase tracking-wider">Fix:</span> {k.remedy}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* In-Depth Technical Walkthrough */}
      <section className="mt-14 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <div className="prose prose-neutral dark:prose-invert max-w-none">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            How Googlebot Allocates Crawl Resources
          </h2>
          <p>
            Googlebot determines a site&apos;s crawl budget using two key elements: the **Crawl Capacity Limit** and
            the **Crawl Demand**. The capacity limit ensures Googlebot does not overload your web server. If your host
            responds with 503 errors or long response latencies, Googlebot will quickly dial back.
            Crawl demand is determined by popularity; if a site has stale content, little original research, or high amounts of duplicate text, Googlebot has no incentive to crawl it frequently.
          </p>
          <p className="mt-3">
            To build a sustainable programmatic workflow, you must address both sides of the coin. First, use a modern caching layer or build static pages to keep server response times lightning-fast. Second, optimize sitemaps and links to guide crawlers exclusively to high-value pages.
          </p>

          <h3 className="text-lg font-bold text-foreground mt-6 mb-2">Analyzing Sitemaps for Crawl Cleanliness</h3>
          <p>
            A common programmatic SEO error is listing every generated path in a single, massive sitemap.xml.
            If your sitemap contains redirecting paths, dead pages, or thin content URLs, Googlebot spends its
            limited crawl window verifying pages that shouldn&apos;t be indexed. Keep sitemaps under 50,000 URLs
            per file, split them by directory category, and ensure they only feature indexable canonical paths.
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
            source: "crawlBudget",
            note: "Google's crawl budget guidelines outline how crawl limits and crawl demand parameters are computed for large sites.",
          },
          {
            source: "scaledContent",
            note: "Scaled content policy definitions illustrate why Googlebot deprioritizes low-originality template routes.",
          },
          {
            source: "sitemaps",
            note: "Google's official sitemap specification sets the size and status limitations for XML sitemaps.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Is crawl budget leakage holding back your site&apos;s traffic growth? Run a free, template-aware pre-flight audit
          to spot crawl obstacles and redirects instantly.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit crawl budget paths
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
    </main>
  );
}
