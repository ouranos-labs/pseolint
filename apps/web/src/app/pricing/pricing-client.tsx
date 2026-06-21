"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/lib/analytics/use-analytics";
import { SourcesSection } from "@/components/marketing/sources-section";
import { ENGINE_VERSION } from "@/lib/version";

type Interval = "monthly" | "yearly";

const COMPARISON_ROWS: ReadonlyArray<{ feature: string; free: string; pro: string }> = [
  { feature: "Audit count", free: "Unlimited one-shot", pro: "Unlimited monitored" },
  { feature: "Sampling model (web UI)", free: "up to 200 pages, stratified across templates", pro: "up to 500 pages on manual re-audit, 200 per monitoring run, stratified across templates" },
  { feature: "Background monitoring", free: "—", pro: "Per-domain, change-driven (only re-fetches URLs that changed); fires template_degraded alerts on regression" },
  { feature: "Per-template verdict", free: "Included (up to free-tier budget)", pro: "Included — shows which template is dragging your score down" },
  { feature: "Triage", free: "Rule engine only", pro: "AI triage with daily budget cap" },
  { feature: "BYO AI key", free: "CLI only", pro: "Anthropic / OpenAI, no markup" },
  { feature: "Data sources", free: "—", pro: "CSV/JSON upload + GSC integration" },
  { feature: "Rule overrides", free: "Defaults only", pro: "Per-rule severity + thresholds" },
  { feature: "Audit retention", free: "30 days", pro: "Unlimited history" },
  { feature: "Integrations", free: "GitHub Action", pro: "GitHub Action + Google & IndexNow Instant Indexing + GSC + Webflow + WP" },
  { feature: "Domain ownership verification", free: "—", pro: "DNS / meta-tag verified" },
  { feature: "GDPR export + audit log", free: "—", pro: "Included" },
  { feature: "Support", free: "Community + GitHub issues", pro: "Email, 1 business day" },
];

type FAQ = { q: string; a: string };
const FAQS: ReadonlyArray<FAQ> = [
  {
    q: "Is the free tier really unlimited?",
    a: "Yes. There is no audit cap, no credit card, and no trial countdown. Each free audit covers up to 200 pages from the web UI, stratified across your URL templates — it detects your templates and produces a per-template verdict. The open-source CLI (npx pseolint <url>) has no page limit at all and runs fully on your own machine. Reports are kept for 24 hours anonymously, or 30 days when you sign in.",
  },
  {
    q: "What happens if I cancel Pro?",
    a: "Monitoring stops at the end of your billing period and your domains move back to one-shot mode. Historical audits remain readable for 30 days, then are pruned to match the free retention window. You can re-subscribe at any time and resume monitoring without losing the domain config.",
  },
  {
    q: "How does Pro pricing compare to Screaming Frog, Sitebulb, or Ahrefs Site Audit?",
    a: "Screaming Frog SEO Spider is around $259/year per seat for unlimited URLs but is desktop-only with no monitoring. Sitebulb starts at $13.50/month for a single project. Ahrefs Site Audit ships inside the Lite plan at $129/month. pseolint Pro at $19/month ($180/year, two months free) is positioned for solo operators and indie pSEO programs that want continuous monitoring + AI triage without an enterprise contract.",
  },
  {
    q: "Can I bring my own AI key for triage?",
    a: "Yes. Pro lets you paste an Anthropic or OpenAI API key and route triage through your own account — token costs land on your bill with zero markup from us. If you would rather not manage a key, the managed-credit mode covers triage with a daily budget cap so a runaway batch never surprises you.",
  },
  {
    q: "Do you offer team plans?",
    a: "Pro is single-seat today. Multi-seat workspaces with shared dashboards, role-based access, and per-seat billing are on the roadmap and will ship as a tier above Pro rather than a replacement. Existing Pro subscribers will be grandfathered into team pricing when it launches.",
  },
  {
    q: "Is there a self-hosted option?",
    a: "Yes. The core engine, CLI, and MCP server are MIT-licensed and published as @pseolint/core, pseolint, and @pseolint/mcp on npm. Run npx pseolint <url> locally or wire the GitHub Action into CI — no data leaves your infrastructure, and you get the same template-aware SpamBrain + AEO scoring that powers the hosted product, including per-template verdicts and siteVerdictFromTemplates. A --state flag persists per-URL fetch metadata so subsequent runs only re-audit URLs that actually changed.",
  },
  {
    q: "What is the refund policy?",
    a: "If pseolint Pro does not work for you within the first 14 days of a new subscription, email support and we will refund the most recent charge in full — monthly or yearly. After 14 days, yearly subscriptions are pro-rated for the unused months. We never auto-renew without sending a reminder seven days in advance.",
  },
];

function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function buildFaqJsonLd(faqs: ReadonlyArray<FAQ>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

const PRO_FEATURES = [
  { title: "Unlimited monitored domains", detail: "Change-driven monitoring: re-fetches only URLs with evidence of change (sitemap lastmod, prior warning/error findings, age-floor). Sites with reliable sitemaps see ~95% fewer fetches per run. Every monitoring run detects templates, scores per template, and fires template_degraded alerts on regression." },
  { title: "Per-template verdict — which template is broken", detail: "Every Pro audit tells you which template is dragging your site score down. Manual re-audits sample up to 500 pages for tighter per-template variance estimates; monitoring runs sample up to 200, stratified across templates." },
  { title: "Fix queue across your portfolio", detail: "Ranked by severity × pages today; by Search Console impressions once you connect it. Per-template breakdowns so you know which template to fix first." },
  { title: "SpamBrain + AEO coverage", detail: "Classical SEO and Answer Engine Optimization, scored by your site's archetype — your pages stay rankable AND citable by LLMs." },
  { title: "Managed AI triage", detail: "No API keys to configure, daily budget caps enforced. Capability ships in our open-source CLI; Pro removes the ops burden." },
  { title: "Integrations & Instant Indexing", detail: "GitHub Action upload · Google & IndexNow Instant Indexing · Search Console · Webflow (v1.1) · WordPress (v1.2)." },
  { title: "Dashboard + history", detail: "Portfolio strip, per-domain timelines with template trend lines, suppressions that persist across runs." },
  { title: "Private hosted reports + PDF export", detail: "Shareable links. Branded PDF output for stakeholder handoff." },
] as const;

const FREE_FEATURES = [
  "Unlimited one-shot audits",
  "Up to 200 pages per audit (web UI) · CLI has no limit",
  "Public shareable report link",
  "Reports kept 24h (anon) / 30d (signed-in)",
] as const;

function PricingInner() {
  const [loading, setLoading] = useState<Interval | null>(null);
  const search = useSearchParams();
  const intent = search.get("intent");
  const auditSlug = search.get("audit");
  const { track } = useAnalytics();

  const go = async (interval: Interval) => {
    setLoading(interval);
    track({ name: "checkout_started", props: { interval } });
    const res = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval, intent, auditSlug }),
    });
    if (res.ok) {
      const { url } = await res.json();
      window.location.assign(url);
    } else if (res.status === 401) {
      window.location.assign("/signin");
    } else {
      alert("Checkout failed. Please try again.");
      setLoading(null);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Pricing · one plan
      </div>

      <div className="mt-3 max-w-2xl">
        <h1
          className="text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={ { fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 } }
        >
          Audits stay free. <span className="text-primary">Monitoring</span> is the upgrade.
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          Run a one-shot audit without an account, any time, at no cost. Pay only when you need
          pseolint to watch a domain for you — daily diff-audits, weekly full re-audits, a fix queue
          ranked by real traffic, and a dashboard of everything you&apos;re tracking.
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        The CLI and GitHub Action are free and always will be.
        Pro adds the infrastructure around them.
      </p>

      { intent === "monitor" && auditSlug && (
        <div className="mt-6 rounded-[18px] border border-primary/30 bg-primary/10 px-5 py-3 text-xs text-foreground">
          After checkout we&apos;ll start monitoring the domain from{ " " }
          <a className="font-mono underline-offset-4 hover:underline" href={ `/r/${auditSlug}` }>
            this audit
          </a>.
        </div>
      ) }

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <PlanCard interval="monthly" price="19" cadence="/ month" loading={ loading } onClick={ go } />
        <PlanCard
          interval="yearly"
          price="180"
          cadence="/ year"
          note="2 months free · $48 saved"
          loading={ loading }
          onClick={ go }
          highlight
        />
      </div>

      <section className="mt-14">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          What Pro unlocks
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          { PRO_FEATURES.map((f) => (
            <li
              key={ f.title }
              className="flex items-start gap-3 rounded-[22px] border border-border/60 bg-card/40 p-5"
            >
              <span className="mt-0.5 inline-grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                <Check className="h-3.5 w-3.5" strokeWidth={ 2.5 } />
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{ f.title }</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{ f.detail }</span>
              </div>
            </li>
          )) }
        </ul>
      </section>

      <section className="mt-14 rounded-[28px] border border-border/70 bg-card/40 p-7 backdrop-blur-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Free · no account needed
          </h2>
          <span className="font-mono text-[11px] text-muted-foreground">no credit card</span>
        </div>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          { FREE_FEATURES.map((f) => (
            <li key={ f } className="flex items-start gap-2 text-sm text-foreground/90">
              <span
                aria-hidden
                className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground"
              />
              { f }
            </li>
          )) }
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Free vs Pro · feature by feature
        </h2>
        <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
          Both tiers run the same template-aware SpamBrain and AEO engine from{ " " }
          <code className="font-mono text-xs">@pseolint/core {ENGINE_VERSION}</code> — it
          audits by template (stratified across templates), produces one verdict per
          template cluster, and determines the site verdict from the worst template
          with ≥5% URL coverage. The difference between Free and Pro is what
          happens around the audit: deeper 500-page re-audits, monitoring,
          template_degraded alerts, triage, integrations, retention, and overrides.
          The numbers below are the live limits enforced by the platform — quote them.
        </p>
        <div className="overflow-x-auto rounded-[22px] border border-border/70 bg-card/40">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60 bg-card/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 font-medium">Feature</th>
                <th className="px-5 py-3 font-medium">Free · $0</th>
                <th className="px-5 py-3 font-medium text-primary">Pro · $19/mo</th>
              </tr>
            </thead>
            <tbody>
              { COMPARISON_ROWS.map((row, idx) => (
                <tr
                  key={ row.feature }
                  className={
                    idx === COMPARISON_ROWS.length - 1
                      ? ""
                      : "border-b border-border/40"
                  }
                >
                  <th
                    scope="row"
                    className="w-[34%] px-5 py-3 text-left text-xs font-medium text-foreground/90"
                  >
                    { row.feature }
                  </th>
                  <td className="px-5 py-3 text-xs text-muted-foreground">
                    { row.free === "—" ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground/60">
                        <X className="h-3 w-3" aria-hidden /> Not included
                      </span>
                    ) : (
                      row.free
                    ) }
                  </td>
                  <td className="px-5 py-3 text-xs text-foreground/90">
                    <span className="inline-flex items-center gap-1.5">
                      <Check className="h-3 w-3 text-primary" aria-hidden />
                      { row.pro }
                    </span>
                  </td>
                </tr>
              )) }
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-14 rounded-[28px] border border-border/70 bg-card/40 p-7 backdrop-blur-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Why we chose this pricing model
        </h2>
        <div className="mt-4 grid gap-4 text-sm leading-relaxed text-foreground/90 sm:grid-cols-2">
          <p>
            pseolint is OSS-first by design. The CLI, the rule engine, and the MCP server are
            MIT-licensed and free forever — published to npm as{ " " }
            <code className="font-mono text-xs">@pseolint/core</code>,{ " " }
            <code className="font-mono text-xs">pseolint</code>, and{ " " }
            <code className="font-mono text-xs">@pseolint/mcp</code>. Anyone can audit a site
            from a laptop, drop the GitHub Action into CI, or fork the rules. The
            template-aware engine — including per-template verdicts, uniformity scores, and
            <code className="font-mono text-xs"> siteVerdictFromTemplates</code> — is in the
            open-source core. That part of the product never goes behind a paywall.
          </p>
          <p>
            Pro funds the surface area you cannot easily self-host: a queue worker that wakes up
            on a schedule, an AI-triage budget guard, integrations with Search Console and CMSes,
            and a database that retains your audit history beyond a single CI run. We deliberately
            did not gate any rule, severity, or scoring formula. If pseolint flags an issue in
            Pro, the same rule will flag it in the free CLI, and you can debug it offline.
          </p>
        </div>
      </section>

      <section className="mt-14">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Frequently asked questions
        </h2>
        <div className="grid gap-3">
          { FAQS.map((faq) => (
            <details
              key={ faq.q }
              className="group rounded-[22px] border border-border/60 bg-card/40 p-5 open:border-border-strong"
            >
              <summary className="cursor-pointer list-none text-sm font-medium text-foreground marker:hidden">
                <span className="flex items-start justify-between gap-4">
                  <span>{ faq.q }</span>
                  <span
                    aria-hidden
                    className="mt-1 inline-block font-mono text-xs text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{ faq.a }</p>
            </details>
          )) }
        </div>
      </section>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
        <p className="text-muted-foreground">Not ready to pay? Run a free audit first.</p>
        <Link
          href="/"
          onClick={() => track({ name: "cta_clicked", props: { location: "pricing_try_free" } })}
          className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Try free audit →
        </Link>
      </div>

      <SourcesSection
        sources={ [
          {
            source: "spamPolicies",
            note: "Both tiers exist to catch the scaled-content, doorway, and site-reputation patterns Google's spam policies enforce, before those patterns cost you rankings.",
          },
          {
            source: "helpfulContent",
            note: "The monitored Pro tier re-checks your templates against the people-first content standard on every change, so a helpful-content regression surfaces in an alert rather than in a traffic drop.",
          },
        ] }
      />

      <FaqJsonLd faqs={ FAQS } />
    </main>
  );
}

function FaqJsonLd({ faqs }: { faqs: ReadonlyArray<FAQ> }) {
  // FAQS is a compile-time-static array; safeJsonLd escapes `<` so any
  // string can't terminate the surrounding <script> block. Mirrors the
  // pattern used in src/app/tools/[tool]/page.tsx and rules/[ruleId]/page.tsx.
  const html = safeJsonLd(buildFaqJsonLd(faqs));
  // eslint-disable-next-line react/no-danger
  const props = { dangerouslySetInnerHTML: { __html: html } } as const;
  return <script type="application/ld+json" { ...props } />;
}

export default function PricingClient() {
  return (
    <Suspense>
      <PricingInner />
    </Suspense>
  );
}

function PlanCard({
  interval,
  price,
  cadence,
  note,
  loading,
  onClick,
  highlight,
}: {
  interval: Interval;
  price: string;
  cadence: string;
  note?: string;
  loading: Interval | null;
  onClick: (i: Interval) => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "relative flex flex-col gap-6 rounded-[28px] border bg-card/60 p-7 backdrop-blur-sm transition-colors justify-between " +
        (highlight ? "border-primary/40" : "border-border/70 hover:border-border-strong")
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{ interval }</span>
        { highlight && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
            best value
          </span>
        ) }
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={ `text-[56px] leading-[0.9] tabular-nums sm:text-[64px] md:text-[72px] ${highlight ? "text-primary" : "text-foreground"}` }
          style={ { fontFamily: "var(--font-display)", fontStyle: "italic" } }
        >
          ${ price }
        </span>
        <span className="text-sm text-muted-foreground">{ cadence }</span>
      </div>

      { note && (
        <p className="-mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-primary/90">
          <span className="inline-block h-1 w-1 rounded-full bg-primary" />
          { note }
        </p>
      ) }

      <Button
        className="h-11 w-full rounded-[14px]"
        onClick={ () => onClick(interval) }
        disabled={ loading === interval }
        variant={ highlight ? "default" : "secondary" }
      >
        { loading === interval ? "Redirecting…" : "Subscribe" }
      </Button>
    </div>
  );
}
