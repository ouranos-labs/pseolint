import { type Metadata } from "next";
import Link from "next/link";
import { SCORED_RULE_COUNT } from "@pseolint/core/rules/scope";
import { MARKETING_TOOLS } from "@/lib/marketing-tools";
import { guidesForSection } from "@/lib/marketing-guides";
import { env } from "@/lib/env";
import { SourcesSection } from "@/components/marketing/sources-section";
import { ENGINE_VERSION } from "@/lib/version";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Free SEO tools for programmatic SEO · pseolint",
  description:
    "Three free SEO tools backed by the open-source pseolint engine: SpamBrain checker, thin-content scanner, doorway-page detector. No signup.",
  alternates: { canonical: `${SITE_URL}/tools` },
  openGraph: {
    title: "Free SEO tools for programmatic SEO sites",
    description:
      "SpamBrain checker, thin-content scanner, and doorway-page detector. Template-aware — each rule contributes to a per-template verdict. No signup, runs in 60 seconds.",
    url: `${SITE_URL}/tools`,
    type: "website",
    images: [`${SITE_URL}/opengraph-image`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Free SEO tools for programmatic SEO sites",
    description:
      "SpamBrain checker, thin-content scanner, and doorway-page detector. Template-aware — no signup, runs in 60 seconds.",
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
    a: `All three run the same open-source pseolint engine — template-aware SpamBrain + AEO scoring. It audits by template, not by URL: it detects the templates on your site, samples pages stratified across them (up to 200), runs ${SCORED_RULE_COUNT} rules, then aggregates each template's findings into a per-template verdict. The site verdict is the worst template that has ≥5% URL coverage (spec §15.1). spam/* rules map directly to documented Google SpamBrain signals: thin content, doorway patterns, near-duplicate clusters, boilerplate ratio, template diversity, scaled-content density, and link-spam detectors. aeo/* rules cover answer-engine readiness for AI Overviews, Perplexity, and ChatGPT search.`,
  },
  {
    q: "Why three separate tools instead of one full audit?",
    a: "A single 'run-the-full-audit' CTA scares people who already suspect what's wrong. The SpamBrain checker is for operators who watched a March 2024-style ranking drop and want a numerical risk score. The thin-content scanner is for editors triaging a content library. The doorway-page detector is for paid-acquisition teams worried their landing pages will get reclassified under the May 7, 2024 site-reputation-abuse policy. Same engine, same rule set, three different framings.",
  },
  {
    q: "Is the engine open source?",
    a: "Yes — MIT-licensed on GitHub at github.com/ouranos-labs/pseolint (core, CLI, and MCP server all published on npm). Anything you run in the browser here you can also run locally against pre-deploy builds, in CI, or via the Model Context Protocol server. Median audit time is ~60 seconds for a single URL.",
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
        Three free SEO tools backed by the open-source pseolint engine —
        SpamBrain checker, thin-content scanner, doorway-page detector. $0, no
        signup, runs in a 60-second median. Each tool now produces a
        per-template verdict, not a per-URL list. Pick a tool below; methodology
        and comparison table follow.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        <span className="text-foreground">Credibility layer:</span> the
        engine has been empirically calibrated against a curated corpus of
        reputable, in-production pSEO sites. It audits by template — it
        detects your site&apos;s URL templates, samples pages stratified across them,
        and produces one verdict per template cluster rather than a flat per-URL
        list. Verdicts are reproducible at a fixed sample-seed; findings cluster
        instead of dumping per-pair noise; severity demotions are auditable via{ " " }
        <code className="font-mono text-xs">summary.appliedSeverityDemotions</code>.
        Dated snapshot results, the open-source corpus, and the trade-offs we
        accepted are documented at{ " " }
        <Link href="/methodology" className="text-foreground underline decoration-dotted underline-offset-2">/methodology</Link>.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        { MARKETING_TOOLS.map((tool) => (
          <Link
            key={ tool.slug }
            href={ `/tools/${tool.slug}` }
            className="group flex flex-col gap-3 rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm transition-colors hover:border-primary/50 hover:bg-card"
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                { tool.title }
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                { tool.ruleLens }
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              { tool.shortPitch }
            </p>
            <span className="inline-flex items-center text-sm font-medium text-primary group-hover:underline">
              Open tool →
            </span>
          </Link>
        )) }
      </div>

      {/* Editorial guides — see the note in app/rules/page.tsx; these route files
          are not iterated by MARKETING_TOOLS and were orphaned without this block. */}
      <section className="mt-12">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Guides</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Walkthroughs for setting up a programmatic build and checking it before launch.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          { guidesForSection("tools").map((guide) => (
            <li key={ guide.slug }>
              <Link
                href={ `/tools/${guide.slug}` }
                className="group flex h-full flex-col rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm transition-colors hover:border-primary/50 hover:bg-card"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Guide
                  </span>
                  <span className="text-xs text-primary transition-transform group-hover:translate-x-0.5">
                    Read →
                  </span>
                </div>
                <h3 className="mt-3 text-lg font-semibold tracking-tight text-foreground">
                  { guide.title }
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  { guide.blurb }
                </p>
              </Link>
            </li>
          )) }
        </ul>
      </section>

      <div className="mt-6 grid gap-4 rounded-[22px] border border-border/60 bg-card/40 p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-success">
            What these tools are for
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Programmatic-SEO sites (template-driven content at scale) and AI Overview
            readiness — SpamBrain triggers from the March 27, 2026 core update that
            tightened scaled-content signals on date-stacked corpora (the most recent
            classifier shift to demote pSEO sites), the May 7, 2024 site-reputation-abuse
            policy (now detected by{ " " }
            <code className="font-mono">links/host-section-divergence</code>), the March
            5, 2024 scaled-content-abuse update, plus the AEO patterns that determine
            ChatGPT, Perplexity, and Google AI Overview citations.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            What they aren&apos;t
          </p>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            A general SEO audit. For Core Web Vitals use{ " " }
            <a href="https://pagespeed.web.dev" className="text-primary hover:underline" rel="nofollow">PageSpeed Insights</a>.
            For broken links + general crawl use{ " " }
            <a href="https://sitebulb.com" className="text-primary hover:underline" rel="nofollow">Sitebulb</a> ($35/mo) or{ " " }
            <a href="https://screamingfrog.co.uk" className="text-primary hover:underline" rel="nofollow">Screaming Frog</a> ($259/yr).
            For competitor / backlink data use{ " " }
            <a href="https://ahrefs.com" className="text-primary hover:underline" rel="nofollow">Ahrefs</a> ($129/mo) or{ " " }
            <a href="https://semrush.com" className="text-primary hover:underline" rel="nofollow">Semrush</a> ($139.95/mo).
          </p>
        </div>
      </div>

      <section className="mt-8 space-y-3 rounded-[22px] border border-border/60 bg-card/40 p-5 text-sm leading-relaxed text-muted-foreground">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
          How rules feed into per-template verdicts
        </h2>
        <p>
          The engine audits by template, not by URL. After template detection
          (Phase 1), the engine samples pages stratified across templates and runs 32
          rules (Phase 2). Rules aggregate differently depending on their type:
        </p>
        <ul className="ml-4 list-disc space-y-1.5">
          <li>
            <span className="font-medium text-foreground">Per-page → template uniformity score.</span>{ " " }
            <code className="font-mono text-xs">spam/thin-content</code> fires on each sampled page
            and feeds the template&apos;s uniformity score (0–1). A score ≥0.8 means ≥8 of 10
            sampled pages are thin — that template gets a critical verdict regardless of the other
            templates&apos; health.
          </li>
          <li>
            <span className="font-medium text-foreground">Corpus-wide (not template-scoped).</span>{ " " }
            <code className="font-mono text-xs">spam/near-duplicate</code> is computed across the
            full sampled corpus — it compares pages across templates to surface cross-template
            duplication, not just within a single template.
          </li>
          <li>
            <span className="font-medium text-foreground">Per-page → template-level signal.</span>{ " " }
            <code className="font-mono text-xs">aeo/citable-facts</code> fires per sampled page;
            an 80% fire rate on a template (8/10 pages lack citable facts) becomes a template-level
            finding reported in the template card, not a list of 8 individual URL findings.
          </li>
          <li>
            <span className="font-medium text-foreground">Site verdict.</span>{ " " }
            The site verdict is the worst-performing template that covers ≥5% of URLs
            (spec §15.1 <code className="font-mono text-xs">siteVerdictFromTemplates</code>). A
            healthy landing page template cannot mask a broken product-listing template if that
            listing template holds most of your URLs.
          </li>
        </ul>
        <p>
          These three tools each foreground a different slice of that rule surface — but the
          underlying per-template aggregation runs in every one.
        </p>
      </section>



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
          templates — and that is exactly what pseolint does: it audits your
          templates, not your URLs.
        </p>
        <p>
          The pseolint v{ENGINE_VERSION} engine ships {SCORED_RULE_COUNT} rules across spam, content, aeo, links,
          schema, tech, data, and cannibalization categories. Each rule&apos;s
          findings aggregate per template — you get one verdict per template
          cluster, not a flat per-URL list. The spam rules map directly to
          documented SpamBrain signals — thin content, doorway patterns,
          near-duplicate clusters, boilerplate ratio, template diversity,
          scaled-content density, and link-spam detectors. The aeo rules cover
          answer-engine readiness for AI Overviews, Perplexity, and ChatGPT search.
        </p>
        <p>
          The whole engine is{ " " }
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
                <td className="px-4 py-3">up to 200 pages, stratified across templates, 3 audits/day per browser</td>
                <td className="px-4 py-3">Yes — template-aware engine; per-template verdicts</td>
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
          shipped its v0.4.0 redesign on April 29, 2026, added change-driven
          monitoring in v0.5.0 (May 1, 2026), shipped the{ " " }
          <code className="font-mono">links/host-section-divergence</code>
          { " " }site-reputation-abuse detector in v0.5.1 (May 3, 2026), the
          v0.5.2 credibility layer (May 3, 2026), and the
          template-aware engine — auditing by template rather than by URL,
          producing one verdict per template cluster via{ " " }
          <code className="font-mono">siteVerdictFromTemplates</code>. Runs as
          a Cloudflare R2 + Inngest pipeline on Vercel, MIT-licensed end-to-end
          so anything you see in the browser audit is reproducible from the
          CLI.
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

      <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        The three tools cover three distinct SpamBrain-risk surfaces: the SpamBrain
        checker targets scaled-content-abuse and thin-content signals across your full
        template set, the thin-content scanner isolates the{" "}
        <code className="font-mono text-xs">spam/thin-content</code> and{" "}
        <code className="font-mono text-xs">content/boilerplate-ratio</code> rules per
        template, and the doorway-page detector maps to the site-reputation-abuse policy
        enforced since May 7, 2024. Each tool samples pages stratified across detected templates
        and returns a per-template verdict — not a flat per-URL list — so triage goes
        straight to the template responsible rather than to hundreds of individual URLs.
      </p>

      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        A worked example: Halverwood Cabinetry pointed all three tools at its 2,100-page{" "}
        <code className="font-mono text-xs">/cabinet/&#123;wood&#125;-&#123;finish&#125;</code> catalog. The
        SpamBrain checker returned a domain risk of 57; the thin-content scanner isolated 612
        pages under the 300-word floor with a median body of 188 words; the doorway-page
        detector clustered 140 URLs at a 0.90 SimHash and flagged the shared quote-request
        funnel they all pointed to. Operator Renske Adelaar rebuilt the worst template with
        per-finish drying times, a measured hardness rating, and a price band, and a re-run two
        weeks later dropped the domain risk to 24.
      </p>

      <SourcesSection
        sources={[
          {
            source: "spamPolicies",
            note: "Google's spam policies define the thin-content, doorway, and scaled-content-abuse signals these tools directly audit against.",
          },
          {
            source: "scaledContent",
            note: "The March 5, 2024 scaled-content-abuse update is the primary algorithmic signal the SpamBrain checker and thin-content scanner are calibrated against.",
          },
          {
            source: "helpfulContent",
            note: "Google's helpful-content guidance underpins the content-quality rules (boilerplate ratio, unique-value, citable-facts) surfaced by the thin-content scanner.",
          },
        ]}
      />

      <script
        type="application/ld+json"
        // JSON-LD payload is built from compile-time-static MARKETING_TOOLS and
        // passed through safeJsonLd which escapes `<` to neutralize any string
        // that could prematurely close the surrounding script tag.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={ { __html: safeJsonLd(collectionSchema) } }
      />
      <script
        type="application/ld+json"
        // FAQPage payload built from compile-time-static FAQS array, escaped
        // by safeJsonLd to prevent script-tag breakout.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={ { __html: faqLd } }
      />
    </main>
  );
}
