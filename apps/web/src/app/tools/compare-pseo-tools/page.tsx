import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { PricingSimulator } from "./pricing-simulator";
import { SourcesSection } from "@/components/marketing/sources-section";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? env().BETTER_AUTH_URL ?? "https://pseolint.dev";

const url = `${SITE_URL.replace(/\/$/, "")}/tools/compare-pseo-tools`;

export const metadata: Metadata = {
  title: "Compare Programmatic SEO Tools & Credit Costs · pseolint",
  description:
    "Compare credit costs and indexation risks between Byword, SEOmatic, and self-hosted workflows. Calculate your ROI and avoid thin-content crawler penalties.",
  alternates: { canonical: url },
  openGraph: {
    title: "Compare Programmatic SEO Tools & Credit Costs",
    description:
      "Avoid wasting thousands of dollars on credits that Google deindexes. Calculate Byword vs SEOmatic vs Self-hosted costs with our dynamic ROI simulator.",
    url,
    type: "website",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Compare Programmatic SEO Tools & Credit Costs",
    description:
      "Calculate Byword vs SEOmatic vs Self-hosted costs and indexation risks with our dynamic ROI simulator.",
  },
};

const FAQS = [
  {
    q: "Why are credit-based programmatic SEO tools risky?",
    a: "Credit-based tools charge you per page generated, regardless of whether Google actually indexes it. If 40% of your templates are flagged as thin content by SpamBrain and dropped to 'Crawled - currently not indexed', you have lost 40% of your credit investment. pseolint helps you audit templates locally first, ensuring perfect compliance before you burn credits.",
  },
  {
    q: "How does SEOmatic compare to Byword in terms of costs?",
    a: "SEOmatic operates on a subscription limit (e.g. $99/mo for up to 10,000 pages), but to sync those pages to platforms like Webflow, you must buy external sync tools like Whalesync (which costs another $99/mo). Byword charges a flat credit fee per page (around $0.15/page). Self-hosting on Next.js/Astro combined with pseolint is flat $15/mo.",
  },
  {
    q: "What is the best stack for large-scale programmatic SEO?",
    a: "For databases over 10,000 pages, the recommended stack is a self-hosted framework (Next.js, Astro, or Remix) running on Vercel/Cloudflare Pages, backed by a serverless database (Neon or Supabase), and audited in CI using pseolint. This eliminates page limits and credit fees, and guarantees a 90%+ indexation rate.",
  },
];

export default function CompareToolsPage() {
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "pseolint Pre-flight Audit Suite",
    description: "Pre-flight template linter for programmatic SEO builders. Prevents search engine deindexation and scaled content penalties.",
    url: SITE_URL,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
    },
    brand: {
      "@type": "Brand",
      name: "pseolint",
    },
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <nav className="text-xs text-muted-foreground">
        <Link href="/tools" className="hover:text-foreground hover:underline">
          Free tools
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">Compare pSEO tools</span>
      </nav>

      <section className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
          ROI calculator · cost comparison
        </div>
        <h1
          className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          Compare Programmatic SEO Tool Costs & Risks
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Many programmatic SEO campaigns fail because they focus on generation volume instead of
          <span className="text-foreground font-semibold"> indexation quality</span>. Generating 50,000 pages
          using credit-based AI writers is simple, but if Googlebot flags the shared template as thin content,
          your entire investment remains unindexed. Use our interactive calculator below to evaluate costs,
          sync fees, and the real value of running pre-flight audits with pseolint.
        </p>
      </section>

      {/* Simulator Section */}
      <section className="mt-10">
        <PricingSimulator />
      </section>

      {/* Detailed Grid Section */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">
          Platform Feature Breakdown
        </h2>
        <p className="text-xs text-muted-foreground mt-1 mb-6">
          Compare CMS integration, custom schema features, and indexing risk mitigation.
        </p>

        <div className="overflow-x-auto rounded-[22px] border border-border/70 bg-card/40 backdrop-blur-sm">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border/70 bg-card/60 text-muted-foreground">
                <th className="p-4 font-medium">Feature</th>
                <th className="p-4 font-semibold text-foreground">Self-Hosted + pseolint</th>
                <th className="p-4 font-medium">Byword.ai</th>
                <th className="p-4 font-medium">SEOmatic.ai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              <tr>
                <td className="p-4 font-medium text-foreground">Pricing Model</td>
                <td className="p-4 text-primary font-semibold">Flat $15/mo database fee</td>
                <td className="p-4">$0.15 to $0.12 per credit (page)</td>
                <td className="p-4">Subscription base + Whalesync limits</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">Indexation Guard</td>
                <td className="p-4 text-primary font-semibold">✅ Pre-flight validation (SpamBrain-ready)</td>
                <td className="p-4">❌ No (charges for deindexed pages)</td>
                <td className="p-4">❌ No (limited template checking)</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">Page Scale Cap</td>
                <td className="p-4 text-primary font-semibold">Unlimited (millions of pages)</td>
                <td className="p-4">Capped by credit budget</td>
                <td className="p-4">Capped by CMS sync rows (Webflow max 10k)</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">HTML Customization</td>
                <td className="p-4 text-primary font-semibold">Unlimited (Total control over components)</td>
                <td className="p-4">Rigid templates (markdown blocks only)</td>
                <td className="p-4">Basic block editors</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">JSON-LD Schema</td>
                <td className="p-4 text-primary font-semibold">✅ Full nested schemas (Article, Product, Breadcrumb)</td>
                <td className="p-4">❌ No schema.org features</td>
                <td className="p-4">⚠️ Simple schema configs</td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">Developer Workflow</td>
                <td className="p-4 text-primary font-semibold">CI/CD, local linting, CLI scripts</td>
                <td className="p-4">Web UI only</td>
                <td className="p-4">No pre-deploy build integration</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQs Section */}
      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-6">FAQ</h2>
        <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
          {FAQS.map((f, i) => (
            <div key={i} className="grid gap-2 border-b border-border/60 p-6 last:border-b-0">
              <dt className="text-sm font-semibold text-foreground">{f.q}</dt>
              <dd className="text-xs leading-relaxed text-muted-foreground">{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <SourcesSection
        sources={[
          {
            source: "scaledContent",
            note: "Google's scaled-content-abuse policy targets high-volume page creation that fails to offer unique information value per URL.",
          },
          {
            source: "helpfulContent",
            note: "Helpful-content guidance grounds the information density requirements that credit-based generator tools frequently fail to satisfy.",
          },
          {
            source: "crawlBudget",
            note: "Crawl-budget management guidelines note that Googlebot deprioritises low-value duplicate directory lists, making pre-flight audits key.",
          },
        ]}
      />

      {/* CTA Box */}
      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          Running programmatic campaigns without pre-flight linting is like launching code
          without running compiler checks. Try our free command-line linter or run a quick scan
          on our homepage to discover optimization gaps immediately.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Audit a homepage
          </Link>
          <Link
            href="/tools"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            All free tools
          </Link>
        </div>
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd).replace(/</g, "\\u003c") }}
      />
    </main>
  );
}
