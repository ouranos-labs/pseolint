import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Limits & fair-use · pseolint",
  description:
    "What a free pseolint audit includes, the rate limits we enforce, what gets shared publicly, and how retention works. Written plainly so there are no surprises.",
};

export default function LimitsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 pb-20 pt-14">
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
        Written plainly. No dark patterns, no asterisks hiding behind footnotes. If something here
        feels unfair or unclear, reply to <a className="text-primary hover:underline" href="mailto:hello@pseolint.dev">hello@pseolint.dev</a> and we&apos;ll fix it.
      </p>

      <Section title="Scope — what we actually audit">
        <Item k="Pages per free audit" v="Up to 50, sampled from your sitemap.xml" />
        <Item k="Pages per Pro audit" v="Up to 200 (Pro plan)" />
        <Item k="Discovery source" v="sitemap.xml is authoritative. If the sitemap lists 9 URLs, we audit those 9. We do not follow links beyond the sitemap by default." />
        <Item k="Deep-crawl discovery" v={<span>Opt-in option (<code className="font-mono text-foreground">fillBudgetViaLinkDiscovery</code>). When enabled, we follow same-origin links to top up the sample — respectfully, with <code className="font-mono text-foreground">robots.txt</code> <code className="font-mono text-foreground">Disallow</code> rules honored.</span>} />
        <Item k="What we do not do" v="We do not attempt to log in, bypass paywalls, submit forms, execute logged-in-user journeys, or fetch non-HTML assets." />
      </Section>

      <Section title="Rate limits & cooldowns">
        <Item k="Anonymous audits" v="3 per day per browser session" />
        <Item k="Free account audits" v="5 per day (3 remaining rolls over — no)" />
        <Item k="Pro account audits" v="50 per day" />
        <Item k="Cache between users" v="If anyone audited the same URL in the last 60 minutes, you get that result instantly (no new crawl fired). Free users cannot force a re-crawl." />
        <Item k="Re-audit cooldown" v="Authenticated accounts can force a fresh audit. Minimum 5 minutes between forced re-audits of the same URL, regardless of plan — target sites pay for our crawls in bandwidth." />
        <Item k="Per-host ceiling" v="A single domain can receive at most 30 fresh audits per hour across all users, to prevent viral-post amplification from hammering a target." />
      </Section>

      <Section title="How we treat the site we&apos;re auditing">
        <Item k="User-Agent" v={<code className="font-mono text-foreground">Mozilla/5.0 (compatible; pseolint/0.2.2; +https://pseolint.dev/bot)</code>} />
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
        <Item k="35 rules are a subset of SpamBrain" v="We infer plausible SpamBrain signals from public documentation, research, and observed patterns. We do not have access to Google&apos;s actual classifier and make no claim of one-to-one correspondence." />
        <Item k="Score is a heuristic" v="Treat it as a structured conversation, not a verdict. A low score isn&apos;t a guarantee of indexing success. A high score isn&apos;t proof SpamBrain will act." />
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
