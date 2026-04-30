import { type Metadata } from "next";
import Link from "next/link";
import { MARKETING_TOOLS } from "@/lib/marketing-tools";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Free SEO tools — SpamBrain, thin content, doorway page checkers · pseolint",
  description:
    "Three free SEO tools backed by the open-source pseolint engine: SpamBrain checker, thin-content scanner, and doorway-page detector. No signup, runs in 60 seconds.",
  alternates: { canonical: `${SITE_URL}/tools` },
  openGraph: {
    title: "Free SEO tools for programmatic SEO sites",
    description:
      "SpamBrain checker, thin-content scanner, and doorway-page detector. No signup, runs in 60 seconds against any public URL.",
    url: `${SITE_URL}/tools`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free SEO tools for programmatic SEO sites",
    description:
      "SpamBrain checker, thin-content scanner, and doorway-page detector. No signup, runs in 60 seconds.",
  },
};

/**
 * Escape `</` sequences inside a JSON-LD payload so a stray closing tag inside
 * a string can't terminate the surrounding `<script>` block. Inputs are
 * compile-time-static here, but sanitizing keeps the helper safe to reuse.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "What do these free tools actually detect?",
    a: "All three run the same open-source pseolint engine — site-type-aware SpamBrain + AEO scoring that adapts the rule weights to your site's archetype (programmatic-directory, blog, ecommerce, docs, small-marketing). spam/* rules map directly to documented Google SpamBrain signals: thin content, doorway patterns, near-duplicate clusters, boilerplate ratio, template diversity, scaled-content density, and link-spam detectors. aeo/* rules cover answer-engine readiness for AI Overviews, Perplexity, and ChatGPT search.",
  },
  {
    q: "Why three separate tools instead of one full audit?",
    a: "A single 'run-the-full-audit' CTA scares people who already suspect what's wrong. The SpamBrain checker is for operators who watched a March 2024-style ranking drop and want a numerical risk score. The thin-content scanner is for editors triaging a content library. The doorway-page detector is for paid-acquisition teams worried their landing pages will get reclassified under the May 7, 2024 site-reputation-abuse policy. Same engine, same rule set, three different framings.",
  },
  {
    q: "Is the engine open source?",
    a: "Yes — MIT-licensed on GitHub at github.com/ouranos-labs/pseolint (core 0.4.3, CLI 0.4.3, MCP 0.4.3 as of April 30, 2026). Anything you run in the browser here you can also run locally against pre-deploy builds, in CI, or via the Model Context Protocol server. Median audit time is ~60 seconds for a single URL.",
  },
];

export default function ToolsIndexPage() {
  const faqLd = safeJsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Free SEO tools",
    description:
      "A small set of free, no-signup SEO tools backed by the open-source pseolint engine. Each tool audits any public URL through a different SpamBrain-aware lens.",
    url: `${SITE_URL}/tools`,
    isPartOf: {
      "@type": "WebSite",
      name: "pseolint",
      url: SITE_URL,
    },
    hasPart: MARKETING_TOOLS.map((t) => ({
      "@type": "SoftwareApplication",
      name: t.title,
      url: `${SITE_URL}/tools/${t.slug}`,
      applicationCategory: "SEOApplication",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Free tools · no signup
      </div>
      <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
        Free SEO tools
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Three free SEO tools backed by the open-source pseolint engine v0.4.3 —
        SpamBrain checker, thin-content scanner, doorway-page detector. $0, no
        signup, runs in a 60-second median. Pick a tool below; methodology and
        comparison table follow.
      </p>

      <div className="mt-6 grid gap-4 rounded-[22px] border border-border/60 bg-card/40 p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-success">
            What these tools are for
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Programmatic-SEO sites (template-driven content at scale) and AI Overview
            readiness — SpamBrain triggers from the March 5, 2024 scaled-content-abuse
            update + the May 7, 2024 site-reputation-abuse policy + the AEO patterns
            that determine ChatGPT, Perplexity, and Google AI Overview citations.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What they aren&apos;t
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            A general SEO audit. For Core Web Vitals use{" "}
            <a href="https://pagespeed.web.dev" className="text-primary hover:underline" rel="nofollow">PageSpeed Insights</a>.
            For broken links + general crawl use{" "}
            <a href="https://sitebulb.com" className="text-primary hover:underline" rel="nofollow">Sitebulb</a> ($35/mo) or{" "}
            <a href="https://screamingfrog.co.uk" className="text-primary hover:underline" rel="nofollow">Screaming Frog</a> ($259/yr).
            For competitor / backlink data use{" "}
            <a href="https://ahrefs.com" className="text-primary hover:underline" rel="nofollow">Ahrefs</a> ($129/mo) or{" "}
            <a href="https://semrush.com" className="text-primary hover:underline" rel="nofollow">Semrush</a> ($139.95/mo).
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {MARKETING_TOOLS.map((tool) => (
          <Link
            key={tool.slug}
            href={`/tools/${tool.slug}`}
            className="group flex flex-col gap-3 rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm transition-colors hover:border-primary/50 hover:bg-card"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                {tool.title}
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {tool.ruleLens}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {tool.shortPitch}
            </p>
            <span className="inline-flex items-center text-sm font-medium text-primary group-hover:underline">
              Open tool →
            </span>
          </Link>
        ))}
      </div>

      <section className="mt-12 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          What these tools actually detect
        </h2>
        <p>
          Programmatic SEO sites get demoted for a small, well-defined set of
          reasons, and almost all of them trace back to Google&apos;s SpamBrain
          system — the machine-learning spam classifier Google rolled out in 2018
          and re-architected to score pages, not just links. The same classifier
          drives scaled-content-abuse demotions and powers site-reputation-abuse
          enforcement against parasite-SEO landing pages. If your site is
          templated, your audit needs to mirror how SpamBrain reasons about
          templates.
        </p>
        <p>
          The pseolint engine ships rules across spam, content, aeo, links,
          schema, tech, data, and cannibalization categories. The spam rules map
          directly to documented SpamBrain signals — thin content, doorway
          patterns, near-duplicate clusters, boilerplate ratio, template
          diversity, scaled-content density, and link-spam detectors. The aeo
          rules cover answer-engine readiness for AI Overviews, Perplexity, and
          ChatGPT search.
        </p>
        <h2 className="pt-2 text-base font-semibold tracking-tight text-foreground">
          Why three tools and not one
        </h2>
        <p>
          A single &quot;run-the-full-audit&quot; CTA scares people who already
          suspect what&apos;s wrong. The SpamBrain checker is for operators who
          watched a ranking drop and want a numerical risk score. The
          thin-content scanner is for editors triaging a content library. The
          doorway-page detector is for paid-acquisition teams worried their
          landing pages will get reclassified under site-reputation-abuse policy.
          Same engine under the hood, three different framings of the report.
        </p>
        <p>
          The whole engine is{" "}
          <a
            href="https://github.com/ouranos-labs/pseolint"
            className="font-medium text-foreground underline decoration-border-strong underline-offset-2 hover:text-primary"
          >
            MIT-licensed on GitHub
          </a>
          , so anything you run in the browser here you can also run locally
          against pre-deploy builds, in CI, or via the Model Context Protocol
          server. The JSON report contains every finding, every rule reference,
          and a deterministic severity score between 0 and 100.
        </p>
      </section>

      <section className="mt-14 space-y-5 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          How it compares to hosted SEO crawlers
        </h2>
        <p>
          Most pSEO teams already pay for at least one general-purpose crawler.
          The table below lines up the lowest entry-tier price for the four
          tools we hear most often in customer interviews — Ahrefs, Semrush,
          Sitebulb, ContentKing — alongside Screaming Frog (the desktop
          incumbent) and pseolint. Numbers are list price as published on each
          vendor&apos;s pricing page; per-seat surcharges and annual-billing
          discounts are excluded for parity.
        </p>
        <div className="overflow-x-auto rounded-[18px] border border-border/60">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-card/60 text-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">Tool</th>
                <th className="px-4 py-3 font-semibold">Entry price</th>
                <th className="px-4 py-3 font-semibold">Audit limit (entry tier)</th>
                <th className="px-4 py-3 font-semibold">SpamBrain-aware?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">pseolint (this site)</td>
                <td className="px-4 py-3">$0/month</td>
                <td className="px-4 py-3">200 pages per audit, 3 audits/day per browser</td>
                <td className="px-4 py-3">Yes — site-type-aware spam/* rule set</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Ahrefs</td>
                <td className="px-4 py-3">$129/month (Lite plan)</td>
                <td className="px-4 py-3">10,000 crawl credits/month, 1 project</td>
                <td className="px-4 py-3">No — generic site-audit ruleset</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Semrush</td>
                <td className="px-4 py-3">$139.95/month (Pro plan)</td>
                <td className="px-4 py-3">100,000 pages/month across 5 projects</td>
                <td className="px-4 py-3">No — generic site-audit ruleset</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Sitebulb</td>
                <td className="px-4 py-3">$35/month (Lite plan)</td>
                <td className="px-4 py-3">1 project, 10,000 URLs per audit</td>
                <td className="px-4 py-3">Partial — thin-content + duplicate detection</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">Screaming Frog</td>
                <td className="px-4 py-3">$259/year (paid license)</td>
                <td className="px-4 py-3">Free up to 500 URLs, then unlimited per license</td>
                <td className="px-4 py-3">No — desktop crawler, raw signals only</td>
              </tr>
              <tr>
                <td className="px-4 py-3 font-medium text-foreground">ContentKing</td>
                <td className="px-4 py-3">$44/month (Basic plan)</td>
                <td className="px-4 py-3">500 pages monitored, 1 user</td>
                <td className="px-4 py-3">Partial — change-tracking + on-page audit</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The honest read: pseolint is not a replacement for Ahrefs or Semrush
          if you need backlink data, keyword volumes, or rank tracking. It is a
          replacement for the &quot;site audit&quot; module those suites bolt
          on, specifically for templated programmatic content. The engine
          shipped its v0.4.0 redesign on April 29, 2026, runs as a Cloudflare R2
          + Inngest pipeline on Vercel, and stays MIT-licensed end-to-end so
          anything you see in the browser audit is reproducible from the CLI.
        </p>
      </section>

      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          All three tools share the same backend audit — the difference is which
          subset of rules each one foregrounds. If you want the full report
          (every rule, every page) just use the homepage audit instead.
        </p>
        <p className="mt-3">
          Behind the scenes, each invocation runs an asynchronous Inngest job that
          performs sitemap discovery, stratified URL sampling, parallelized HTTP
          fetching with backpressure-controlled concurrency, headless Playwright
          rendering for SPA-shaped origins, semantic boilerplate detection,
          SimHash 64-bit fingerprinting for near-duplicate clustering, and
          severity-graded finding enrichment. The MIT-licensed CLI mirrors the
          same pipeline locally — pipe its JSON output into your CI gate or your
          editor&apos;s diagnostics panel via the Model Context Protocol adapter.
        </p>
        <p className="mt-3 text-xs italic text-muted-foreground/80">
          Implementation footnote: the entity-swap detector applies a Jaccard
          coefficient over noun-trigram shingles per template cohort, then
          dampens recall via Levenshtein-bounded cluster merging — orthogonal
          to the SimHash fingerprint described above. Both signals feed the
          consolidated cannibalization-versus-doorway disambiguation classifier
          documented under the spam/* taxonomy.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Run a full audit
          </Link>
          <Link
            href="/limits"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            See limits
          </Link>
        </div>
      </div>

      <script
        type="application/ld+json"
        // JSON-LD payload is built from compile-time-static MARKETING_TOOLS and
        // passed through safeJsonLd which escapes `<` to neutralize any string
        // that could prematurely close the surrounding script tag.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(collectionSchema) }}
      />
      <script
        type="application/ld+json"
        // FAQPage payload built from compile-time-static FAQS array, escaped
        // by safeJsonLd to prevent script-tag breakout.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: faqLd }}
      />
    </main>
  );
}
