"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Check } from "lucide-react";

export default function Pricing() {
  const [loading, setLoading] = useState<"monthly" | "yearly" | null>(null);

  const go = async (interval: "monthly" | "yearly") => {
    setLoading(interval);
    const res = await fetch("/api/checkout", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval }),
    });
    if (res.ok) { const { url } = await res.json(); window.location.assign(url); }
    else if (res.status === 401) { window.location.assign("/signin"); }
    else { alert("Checkout failed. Please try again."); setLoading(null); }
  };

  const features = [
    "AI triage — 50 audits/day on Sonnet-class models",
    "Unlimited audits, up to 200 pages each",
    "Permanent report history",
    "Private-by-default reports (shareable on request)",
    "PDF export",
    "Post-audit email notifications",
  ];

  return (
    <main className="container mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
      <p className="mt-2 text-muted-foreground">One plan. Everything unlocked. Cancel anytime.</p>

      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <PlanCard interval="monthly" price="$19" cadence="/ month" loading={loading} onClick={go} />
        <PlanCard interval="yearly" price="$180" cadence="/ year" note="Save $48 — 2 months free" loading={loading} onClick={go} highlight />
      </div>

      <ul className="mt-10 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 text-muted-foreground" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}

function PlanCard({ interval, price, cadence, note, loading, onClick, highlight }: {
  interval: "monthly" | "yearly"; price: string; cadence: string; note?: string;
  loading: "monthly" | "yearly" | null; onClick: (i: "monthly" | "yearly") => void; highlight?: boolean;
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
