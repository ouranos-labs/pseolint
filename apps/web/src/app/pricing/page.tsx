"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type Interval = "monthly" | "yearly";

const PRO_FEATURES = [
  { title: "Unlimited monitored domains", detail: "Daily diff-audits + weekly full re-audits, running in the background." },
  { title: "Fix queue across your portfolio", detail: "Ranked by severity × pages today; by Search Console impressions once you connect it." },
  { title: "SpamBrain + AEO coverage", detail: "42+ rules spanning classical SEO and Answer Engine Optimization — your pages stay rankable AND citable by LLMs." },
  { title: "Managed AI triage", detail: "No API keys to configure, daily budget caps enforced. Capability ships in our open-source CLI; Pro removes the ops burden." },
  { title: "Integrations", detail: "GitHub Action upload · Search Console (v1.1) · Webflow (v1.1) · WordPress plugin (v1.2)." },
  { title: "Dashboard + history", detail: "Portfolio strip, per-domain timelines, suppressions that persist across runs." },
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

  const go = async (interval: Interval) => {
    setLoading(interval);
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
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
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

      {intent === "monitor" && auditSlug && (
        <div className="mt-6 rounded-[18px] border border-primary/30 bg-primary/10 px-5 py-3 text-xs text-foreground">
          After checkout we&apos;ll start monitoring the domain from{" "}
          <a className="font-mono underline-offset-4 hover:underline" href={`/r/${auditSlug}`}>
            this audit
          </a>.
        </div>
      )}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <PlanCard interval="monthly" price="19" cadence="/ month" loading={loading} onClick={go} />
        <PlanCard
          interval="yearly"
          price="180"
          cadence="/ year"
          note="2 months free · $48 saved"
          loading={loading}
          onClick={go}
          highlight
        />
      </div>

      <section className="mt-14">
        <h2 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          What Pro unlocks
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {PRO_FEATURES.map((f) => (
            <li
              key={f.title}
              className="flex items-start gap-3 rounded-[22px] border border-border/60 bg-card/40 p-5"
            >
              <span className="mt-0.5 inline-grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/10 text-primary">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{f.title}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{f.detail}</span>
              </div>
            </li>
          ))}
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
          {FREE_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-foreground/90">
              <span
                aria-hidden
                className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground"
              />
              {f}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-border/60 pt-6 text-sm">
        <p className="text-muted-foreground">Not ready to pay? Run a free audit first.</p>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Try free audit →
        </Link>
      </div>
    </main>
  );
}

export default function Pricing() {
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
        "relative flex flex-col gap-6 rounded-[28px] border bg-card/60 p-7 backdrop-blur-sm transition-colors " +
        (highlight ? "border-primary/40" : "border-border/70 hover:border-border-strong")
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{interval}</span>
        {highlight && (
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
            best value
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span
          className={`leading-[0.9] tabular-nums ${highlight ? "text-primary" : "text-foreground"}`}
          style={{ fontSize: "72px", fontFamily: "var(--font-display)", fontStyle: "italic" }}
        >
          ${price}
        </span>
        <span className="text-sm text-muted-foreground">{cadence}</span>
      </div>

      {note && (
        <p className="-mt-2 inline-flex items-center gap-1.5 font-mono text-xs text-primary/90">
          <span className="inline-block h-1 w-1 rounded-full bg-primary" />
          {note}
        </p>
      )}

      <Button
        className="h-11 w-full rounded-[14px]"
        onClick={() => onClick(interval)}
        disabled={loading === interval}
        variant={highlight ? "default" : "secondary"}
      >
        {loading === interval ? "Redirecting…" : "Subscribe"}
      </Button>
    </div>
  );
}
