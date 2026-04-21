"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check } from "lucide-react";

type Interval = "monthly" | "yearly";

const PRO_FEATURES = [
  { title: "Unlimited monitored domains", detail: "Daily diff-audits + weekly full re-audits, running in the background." },
  { title: "Fix queue across your portfolio", detail: "Ranked by severity × pages today; by Search Console impressions once you connect it." },
  { title: "SpamBrain + AEO coverage", detail: "37+ rules spanning classical SEO and Answer Engine Optimization — your pages stay rankable AND citable by LLMs." },
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
];

export default function Pricing() {
  const [loading, setLoading] = useState<Interval | null>(null);

  const go = async (interval: Interval) => {
    setLoading(interval);
    const res = await fetch("/api/checkout", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    if (res.ok) { const { url } = await res.json(); window.location.assign(url); }
    else if (res.status === 401) { window.location.assign("/signin"); }
    else { alert("Checkout failed. Please try again."); setLoading(null); }
  };

  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-2 text-muted-foreground">One plan. Everything unlocked. Cancel anytime.</p>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        The CLI and GitHub Action are free and always will be.
        Pro adds the infrastructure around them.
      </p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <PlanCard interval="monthly" price="$19" cadence="/ month" loading={loading} onClick={go} />
        <PlanCard interval="yearly" price="$180" cadence="/ year" note="Save $48 — 2 months free" loading={loading} onClick={go} highlight />
      </div>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pro</h2>
        <ul className="mt-4 space-y-4 text-sm">
          {PRO_FEATURES.map((f) => (
            <li key={f.title} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="font-medium">{f.title}</span>
                {" — "}
                <span className="text-muted-foreground">{f.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Free</h2>
        <ul className="mt-4 space-y-2 text-sm">
          {FREE_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function PlanCard({ interval, price, cadence, note, loading, onClick, highlight }: {
  interval: Interval; price: string; cadence: string; note?: string;
  loading: Interval | null; onClick: (i: Interval) => void; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardHeader>
        <CardTitle className="capitalize">{interval}</CardTitle>
        <CardDescription>
          <span className="font-mono text-3xl text-foreground">{price}</span>
          <span className="ml-1 text-muted-foreground">{cadence}</span>
        </CardDescription>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </CardHeader>
      <CardContent>
        <Button className="w-full" onClick={() => onClick(interval)} disabled={loading === interval}>
          {loading === interval ? "Redirecting…" : "Subscribe"}
        </Button>
      </CardContent>
    </Card>
  );
}
