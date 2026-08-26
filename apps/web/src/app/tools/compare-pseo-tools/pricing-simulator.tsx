"use client";

import { useState } from "react";
import { DollarSign, AlertTriangle, CheckCircle, ShieldAlert } from "lucide-react";
import { formatNumber } from "@/lib/format";

const STEPS = [500, 1000, 2500, 5000, 10000, 20000, 50000, 100000];

export function PricingSimulator() {
  const [stepIdx, setStepIdx] = useState(4); // Default to 10,000 pages
  const pages = STEPS[stepIdx];

  // Calculators
  const getBywordCost = (n: number) => {
    // ~$0.15 step down to $0.11
    if (n <= 500) return n * 0.15;
    if (n <= 2500) return n * 0.14;
    if (n <= 10000) return n * 0.13;
    if (n <= 50000) return n * 0.12;
    return n * 0.11;
  };

  const getSeomaticCost = (n: number) => {
    // Subscription based + Whalesync sync cost
    let sub = 19;
    let sync = 0;
    if (n <= 500) {
      sub = 19;
      sync = 0;
    } else if (n <= 2500) {
      sub = 49;
      sync = 39;
    } else if (n <= 10000) {
      sub = 99;
      sync = 99;
    } else if (n <= 50000) {
      sub = 299;
      sync = 299;
    } else {
      sub = 499;
      sync = 499;
    }
    return { sub, sync, total: sub + sync };
  };

  const getSelfHostedCost = () => {
    // Vercel $0 + DB fee
    return 15;
  };

  const bywordCost = getBywordCost(pages);
  const seomaticObj = getSeomaticCost(pages);
  const selfHostedCost = getSelfHostedCost();

  // Indexation Risk (40% deindexation simulation for unvetted pages)
  const deidxRate = 0.4;
  const bywordWasted = bywordCost * deidxRate;
  const seomaticWastedItems = Math.round(pages * deidxRate);

  return (
    <div className="rounded-[22px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm shadow-xl">
      {/* Slider Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Target Page Volume
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select the number of programmatic pages you plan to publish.
          </p>
        </div>
        <div className="bg-background/80 px-4 py-2 rounded-xl border border-border/60 flex items-center justify-center">
          <span className="font-mono text-2xl font-bold text-primary tabular-nums">
            {formatNumber(pages)}
          </span>
          <span className="text-xs text-muted-foreground ml-1.5 font-medium uppercase tracking-wider">
            pages
          </span>
        </div>
      </div>

      {/* Slider Input */}
      <div className="mt-6 flex items-center gap-4">
        <input
          id="volume-slider"
          type="range"
          min={0}
          max={STEPS.length - 1}
          step={1}
          value={stepIdx}
          onChange={(e) => setStepIdx(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border/80 accent-primary"
          aria-label="Target page volume slider"
        />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {/* Self Hosted Column */}
        <div className="relative group rounded-2xl border-2 border-primary/50 bg-primary/5 p-5 flex flex-col justify-between transition-all hover:border-primary shadow-md">
          <div className="absolute -top-3 right-4 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full">
            Recommended
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-bold text-foreground">Self-Hosted + pseolint</h4>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Building on Next.js/Astro/SvelteKit + database. Full template design control.
            </p>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold text-foreground">$15</span>
              <span className="text-xs text-muted-foreground font-medium">/ month</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Flat database + Cloudflare/Vercel $0 hosting.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-border/40">
            <div className="flex items-start gap-1.5 text-[11px] text-primary">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">0% Wasted Credits</span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Pre-flight linting spots SpamBrain triggers *before* you publish.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Byword Column */}
        <div className="rounded-2xl border border-border/70 bg-background/30 p-5 flex flex-col justify-between hover:border-border-strong transition-all">
          <div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-bold text-foreground">Byword.ai</h4>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Credit-based generation tool. Locked layout structures.
            </p>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold text-foreground">
                ${formatNumber(Math.round(bywordCost))}
              </span>
              <span className="text-xs text-muted-foreground font-medium">one-time cost</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Based on credit tier (~${(bywordCost / pages).toFixed(2)}/page).
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-border/40">
            <div className="flex items-start gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-warning">
                  ${formatNumber(Math.round(bywordWasted))} Indexation Risk
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  If 40% of pages are flagged thin/duplicate by Google, you lose this credit investment.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SEOmatic Column */}
        <div className="rounded-2xl border border-border/70 bg-background/30 p-5 flex flex-col justify-between hover:border-border-strong transition-all">
          <div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <h4 className="text-sm font-bold text-foreground">SEOmatic.ai</h4>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              No-code CMS generator. Requires external sync connectors.
            </p>

            <div className="mt-5 flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold text-foreground">
                ${seomaticObj.total}
              </span>
              <span className="text-xs text-muted-foreground font-medium">/ month</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              ${seomaticObj.sub}/mo SEOmatic + ${seomaticObj.sync}/mo Whalesync.
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-border/40">
            <div className="flex items-start gap-1.5 text-[11px] text-warning">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-warning">
                  {formatNumber(seomaticWastedItems)} Synced Rows Wasted
                </span>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  40% of database rows fail indexation, consuming CMS sync capacity unnecessarily.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
