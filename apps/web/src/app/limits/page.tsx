import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";

const SITE_URL = env().BETTER_AUTH_URL.replace(/\/$/, "");

export const metadata: Metadata = {
  title: "Limits & fair-use · pseolint",
  description:
    "What a free pseolint audit includes, the rate limits we enforce, what gets shared publicly, and how retention works. Written plainly so there are no surprises.",
  alternates: { canonical: `${SITE_URL}/limits` },
};

/**
 * Escape `</` sequences inside a JSON-LD payload so a stray closing tag inside
 * a string can't terminate the surrounding `<script>` block.
 */
function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const FAQS: { q: string; a: string }[] = [
  {
    q: "Why publish concrete limits at all?",
    a: "Because every undocumented quota becomes a support ticket waiting to happen, and because the operators whose sites we crawl deserve to know in advance how aggressive our fetcher is allowed to be. The numbers describe the runtime envelope the hosted scheduler enforces today: bandwidth ceilings (50 MB per audit), concurrency caps (5 parallel fetches), the per-host throttle (30 fresh audits per hour), Retry-After honouring (capped at 30 seconds), and a 5-minute cooldown between forced re-audits. Tuned to be polite to small origins on shared hosting.",
  },
  {
    q: "How does pseolint treat the site it's auditing?",
    a: "The crawler identifies as Mozilla/5.0 (compatible; pseolint/0.7.0; +https://pseolint.dev/bot), fully honours robots.txt (both Disallow paths and Crawl-delay pacing capped at 60 seconds per request), respects Retry-After once per URL up to 30 seconds, holds at most 5 parallel fetches (dropping to 1 if Crawl-delay is declared), and stops at 50 MB of fetched bytes per audit. SSRF protection rejects localhost, private networks, and non-http(s) schemes.",
  },
];

export default function LimitsPage() {
  const faqLd = safeJsonLd({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  });
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
      <script
        type="application/ld+json"
        // FAQPage payload from compile-time-static FAQS array, escaped via
        // safeJsonLd to prevent script-tag breakout. Same defensive pattern
        // used on tools/page.tsx and rules/page.tsx.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: faqLd }}
      />
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Fair-use & limits
      </div>
      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        What a free audit does, and doesn&apos;t.
      </h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Free tier: $0, up to 200 pages per audit (50 without an account) — v0.6 samples
        K=10 URLs per detected template up to the page budget, 24-hour anonymous retention
        (30-day window for signed-in accounts), 3 audits per day per browser session.
        Pro tier: $19/month ($180/year with 14-day refund), K=20 per template on manual
        re-audits (up to 500 total), K=10 per template on the recurring weekly monitoring
        run (typically 80 fetches for a standard pSEO directory), 50 audits per day,
        unlimited retention. Comparable hosted crawlers like Screaming Frog ($259/year),
        Sitebulb ($35/month), and Ahrefs Site Audit ($129/month) charge for the same
        surface area. Written plainly. No dark patterns, no asterisks hiding behind
        footnotes. If something here feels unfair or unclear, reply to{" "}
        <a className="text-primary hover:underline" href="mailto:hello@pseolint.dev">hello@pseolint.dev</a>{" "}
        and we&apos;ll fix it.
      </p>
      <Section title="Scope — what we actually audit">
        <Item k="Audit focus" v="Programmatic-SEO sites (template-driven content at scale) and AI Overview readiness. v0.6 audits by template — one verdict per template cluster, site verdict = worst template with ≥5% coverage. SpamBrain triggers from the March 5, 2024 scaled-content-abuse update + the May 7, 2024 site-reputation-abuse policy + the AEO patterns that determine ChatGPT, Perplexity, and Google AI Overview citations." />
        <Item k="Pages per anon audit (no account)" v="Up to 50, sampled from your sitemap.xml (templates detected, K=10 per template up to budget)" />
        <Item k="Pages per free audit (signed-in)" v="Up to 200, sampled from your sitemap.xml (templates detected, K=10 per template up to budget)" />
        <Item k="Pages per Pro audit (manual re-audit)" v="K=20 per template — up to 500 total across all templates. Re-audits use the larger sample for tighter variance estimates." />
        <Item k="Pages per Pro scheduled monitoring run" v="K=10 per template, every monitoring run. Typical pSEO directory: 8 templates × 10 samples = 80 fetches per run. More efficient than the v0.5 flat 200-page model and covers all templates instead of one dominant cluster." />
        <Item k="Cumulative coverage (Pro monitoring)" v="10 URLs sampled per template every monitoring run — across all templates. A 12-week monitored site with 8 templates builds 8 × 10 × 12 = 960+ unique URLs in audit history (before deduplication). Coverage grows faster on sites with URL churn; stable sites converge quickly. The per-domain dashboard shows the running total across all templates." />
        <Item k="Discovery source" v="sitemap.xml is authoritative. If the sitemap lists 9 URLs, we audit those 9. We do not follow links beyond the sitemap by default." />
        <Item k="Deep-crawl discovery" v={<span>Opt-in option (<code className="font-mono text-foreground">fillBudgetViaLinkDiscovery</code>). When enabled, we follow same-origin links to top up the sample — respectfully, with <code className="font-mono text-foreground">robots.txt</code> <code className="font-mono text-foreground">Disallow</code> rules honored.</span>} />
        <Item k="What we do not do" v="We do not attempt to log in, bypass paywalls, submit forms, execute logged-in-user journeys, or fetch non-HTML assets." />
      </Section>

      <div className="mt-8 rounded-[18px] border border-primary/25 bg-primary/5 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary/80">
          Why per-template sampling?
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          v0.5 took a flat random sample of 200 URLs across the whole site. On a 100k-URL directory,
          that&apos;s 0.2% coverage — dominated by the largest template cluster, leaving smaller
          templates unsampled. A broken <code className="font-mono text-[11px]">/listing/*</code>{" "}
          template covering 90k pages would average out with clean category pages and score{" "}
          <strong className="text-foreground">caution</strong> instead of{" "}
          <strong className="text-foreground">concerning</strong>.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          v0.6 allocates K=10 samples per template: <strong className="text-foreground">T templates × K samples</strong>.
          A typical pSEO directory (T=8, K=10) = <strong className="text-foreground">80 fetches</strong> — fewer
          than the old 200, with full template coverage. The site verdict reflects the worst
          template, not the average URL. Fix the broken template: fix N pages in one shot.
        </p>
      </div>

      <Section title="What pseolint doesn&apos;t audit">
        <Item k="Core Web Vitals / page speed" v={<span>Out of scope. Use <a href="https://pagespeed.web.dev" className="text-primary hover:underline" rel="nofollow">PageSpeed Insights</a> (free) or the Chrome DevTools Lighthouse panel.</span>} />
        <Item k="Broken links + general site crawl" v={<span>Out of scope. Use <a href="https://sitebulb.com" className="text-primary hover:underline" rel="nofollow">Sitebulb</a> ($35/mo) or <a href="https://screamingfrog.co.uk" className="text-primary hover:underline" rel="nofollow">Screaming Frog</a> ($259/yr, free up to 500 URLs).</span>} />
        <Item k="Competitor research / backlink audits" v={<span>Out of scope. Use <a href="https://ahrefs.com" className="text-primary hover:underline" rel="nofollow">Ahrefs</a> ($129/mo).</span>} />
        <Item k="Keyword research + rank tracking" v={<span>Out of scope. Use <a href="https://semrush.com" className="text-primary hover:underline" rel="nofollow">Semrush</a> ($139.95/mo) or Ahrefs.</span>} />
        <Item k="Image weight / asset optimization" v="Out of scope. PageSpeed Insights covers it; Sitebulb and Screaming Frog go deeper." />
        <Item k="Schema-validator-style validation" v="Partial. We check schema-content consistency and required JSON-LD types as part of the AEO ruleset, but we don't replace Google's Rich Results Test for full schema validation." />
      </Section>

      <Section title="Rate limits & cooldowns">
        <Item k="Anonymous audits" v="3 per day per browser session" />
        <Item k="Free account audits" v="5 per day (does not roll over)" />
        <Item k="Pro account audits" v="50 per day" />
        <Item k="Cache between users" v="If anyone audited the same URL in the last 60 minutes, you get that result instantly (no new crawl fired). Free users cannot force a re-crawl." />
        <Item k="Re-audit cooldown" v="Authenticated accounts can force a fresh audit. Minimum 5 minutes between forced re-audits of the same URL, regardless of plan — target sites pay for our crawls in bandwidth." />
        <Item k="Per-host ceiling" v="A single domain can receive at most 30 fresh audits per hour across all users, to prevent viral-post amplification from hammering a target." />
      </Section>

      <Section title="How we treat the site we&apos;re auditing">
        {/* UA string matches packages/core/src/cache.ts PSEOLINT_USER_AGENT — built dynamically from package.json version */}
        <Item k="User-Agent" v={<code className="font-mono text-foreground">Mozilla/5.0 (compatible; pseolint/0.7.0; +https://pseolint.dev/bot)</code>} />
        <Item k="robots.txt" v="Fully honored — both Disallow paths and Crawl-delay pacing (capped at 60 seconds per request)." />
        <Item k="Retry-After" v="Honored once per URL, capped at 30 seconds. We don&apos;t hammer sites that ask us to back off." />
        <Item k="Concurrency" v="At most 5 parallel fetches, dropping to 1 if Crawl-delay is declared." />
        <Item k="Total bandwidth per audit" v="Capped at 50 MB of fetched bytes. We stop when we hit it, even if the budget isn&apos;t filled." />
        <Item k="SSRF protection" v="localhost, private networks, and non-http(s) schemes are rejected. We only audit public sites." />
      </Section>

      <Section title="Retention — how long reports live">
        <Item k="Anonymous (no account)" v="24 hours, then auto-deleted" />
        <Item k="Free account" v="30 days" />
        <Item k="Pro account" v="Indefinite (until you delete)" />
        <Item k="Monitored-domain audits (Pro)" v="90 days of history for trend charts" />
        <Item k="When a report expires" v="The cached HTML + structured summary are removed from object storage. Score, pageCount, and findingCount stay in the database for analytics. Source URL stays too." />
      </Section>

      <Section title="What&apos;s public vs private">
        <Item k="Free-tier audits" v="Public by default — shareable link + eligible for the /leaderboard. The URL + host + score are visible to anyone who has the share link." />
        <Item k="Pro-tier audits" v="Private by default — only the audit owner can view." />
        <Item k="Visibility toggle" v="Authenticated users can flip any of their own audits to private at any time via the audit page. Anonymous audits cannot be flipped (we can&apos;t confirm ownership)." />
        <Item k="Leaderboard inclusion" v="Public + completed + unexpired audits with 5+ pages. One entry per domain. Opt out by flipping to private (authed only) or letting an anonymous audit expire." />
      </Section>

      <Section title="Accuracy caveats">
        <Item k="Sampling is lossy" v="A 50-page sample of an 860-page site can miss template clusters entirely. The score reflects what we saw, not what&apos;s there. For full coverage, monitor on Pro or make sure your sitemap is complete." />
        <Item k="No JavaScript rendering by default" v="We audit server-rendered HTML. Client-side rendered pages will look empty to us. Pro has optional browser rendering via CDP." />
        <Item k="The rule set is a subset of SpamBrain" v="We infer plausible SpamBrain signals from public documentation, research, and observed patterns. We do not have access to Google&apos;s actual classifier and make no claim of one-to-one correspondence." />
        <Item k="Score is a heuristic" v="Treat it as a structured conversation, not a verdict. A low score isn&apos;t a guarantee of indexing success. A high score isn&apos;t proof SpamBrain will act." />
        <Item k="We can't see off-page signals" v="We measure on-page structural risk. We can't see the off-page authority and user-behaviour signals Google weighs most heavily — so a thin, templated page on a high-authority domain can rank fine, while a clean-looking page can still be suppressed by signals we don't observe. The audit covers the controllable, on-page surface of risk; pair it with your domain's authority for the off-page half." />
      </Section>

      <Section title="Operational controls (when things go wrong)">
        <Item k="Kill switch" v={<code className="font-mono text-foreground">AUDITS_MODE=readonly</code>} />
        <Item k="What readonly mode does" v="New audits return 503 with a clear message; existing reports, leaderboards, and dashboards remain fully functional." />
        <Item k="Blocklist" v="We can pause audits for a specific user or target host if abuse is detected. We always notify the affected party and explain why." />
      </Section>

      <div className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
        <p>
          This page is the source of truth for what you can expect from pseolint&apos;s hosted audits.
          If you see behavior on the service that contradicts something here, that&apos;s a bug — please
          report it.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            See pricing
          </Link>
          <Link
            href="/privacy"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Privacy
          </Link>
          <a
            href="mailto:hello@pseolint.dev"
            className="inline-flex h-10 items-center rounded-[14px] border border-border-strong px-4 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Contact
          </a>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      <dl className="overflow-hidden rounded-[22px] border border-border/70 bg-card/60 backdrop-blur-sm">
        {children}
      </dl>
    </section>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-border/60 px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:gap-6">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="text-sm text-foreground">{v}</dd>
    </div>
  );
}
