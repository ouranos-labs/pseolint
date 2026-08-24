"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

interface Run {
  risk: number | null;
  completedAt: Date | null;
  status: string;
}

interface Props {
  runs: Run[];
  currentThreshold: number;
  host: string;
}

interface FiredPair {
  from: Date;
  to: Date;
  delta: number;
  fired: boolean;
}

const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 50;

export function AlertThresholdSimulator({ runs, currentThreshold, host }: Props) {
  const [threshold, setThreshold] = useState<number>(currentThreshold);

  const completed = useMemo(
    () =>
      runs
        .filter((r) => r.status === "completed" && r.risk != null && r.completedAt != null)
        .map((r) => ({ risk: r.risk as number, t: r.completedAt as Date }))
        .sort((a, b) => a.t.getTime() - b.t.getTime()),
    [runs],
  );

  const { pairs, firedCount } = useMemo(() => {
    const result: FiredPair[] = [];
    let count = 0;
    for (let i = 1; i < completed.length; i += 1) {
      const prev = completed[i - 1];
      const curr = completed[i];
      const delta = curr.risk - prev.risk;
      const fired = delta >= threshold;
      if (fired) count += 1;
      result.push({ from: prev.t, to: curr.t, delta, fired });
    }
    return { pairs: result, firedCount: count };
  }, [completed, threshold]);

  if (completed.length < 2) {
    return (
      <section className="rounded-[18px] border border-border/60 bg-card/40 p-5">
        <Header />
        <p className="mt-3 rounded-[12px] border border-dashed border-border/60 bg-background/40 p-4 text-center text-xs text-muted-foreground">
          Need 2 completed runs to simulate alerts.
        </p>
      </section>
    );
  }

  const firedPairs = pairs.filter((p) => p.fired).sort((a, b) => b.to.getTime() - a.to.getTime());
  const firedTone = countTone(firedCount);
  const isUnsaved = threshold !== currentThreshold;
  const settingsHref = `/dashboard/${encodeURIComponent(host)}/settings`;

  return (
    <section className="rounded-[18px] border border-border/60 bg-card/40 p-5">
      <Header />

      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={`font-mono text-3xl tabular-nums ${firedTone}`}>{firedCount}</span>
        <span className="text-sm text-muted-foreground">
          would have fired in the last 30 days
        </span>
      </div>

      {firedCount === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          No alerts would fire: your threshold is conservative.
        </p>
      )}

      <div className="mt-5 flex items-center gap-3">
        <input
          type="range"
          min={MIN_THRESHOLD}
          max={MAX_THRESHOLD}
          step={1}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          aria-label="Alert threshold (risk delta)"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-border/60 accent-primary"
        />
        <span className="font-mono text-sm tabular-nums text-foreground">
          Δ {threshold >= 0 ? "+" : ""}{threshold}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-mono text-muted-foreground">
          Current saved threshold: <span className="text-foreground">{currentThreshold}</span>
        </span>
        {isUnsaved ? (
          <>
            <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono uppercase tracking-wider text-warning">
              Unsaved
            </span>
            <Link
              href={settingsHref}
              className="font-mono text-primary hover:underline"
            >
              Edit in settings →
            </Link>
          </>
        ) : (
          <span className="font-mono text-muted-foreground">· Matches saved setting</span>
        )}
      </div>

      {firedPairs.length > 0 && (
        <ul className="mt-4 max-h-40 overflow-y-auto rounded-[12px] border border-border/40 bg-background/40">
          {firedPairs.slice(0, 5).map((p, i) => (
            <li
              key={`${p.to.getTime()}-${i}`}
              className="flex items-center justify-between gap-3 border-b border-border/30 px-3 py-1.5 last:border-b-0 font-mono text-[11px] tabular-nums"
            >
              <span className="text-muted-foreground">
                {fmtDate(p.from)} → {fmtDate(p.to)}
              </span>
              <span className={deltaTone(p.delta)}>
                Δ {p.delta >= 0 ? "+" : ""}{p.delta}
              </span>
            </li>
          ))}
          {firedPairs.length > 5 && (
            <li className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">
              + {firedPairs.length - 5} more fired pair{firedPairs.length - 5 === 1 ? "" : "s"}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-sm font-semibold text-foreground">Alert threshold simulator</h2>
      <p className="text-[11px] text-muted-foreground">
        Replays past runs to show how this threshold actually behaves.
      </p>
    </div>
  );
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function countTone(count: number): string {
  if (count === 0) return "text-muted-foreground";
  if (count <= 2) return "text-success";
  if (count <= 5) return "text-warning";
  return "text-destructive";
}

function deltaTone(delta: number): string {
  if (delta >= 10) return "text-destructive";
  if (delta >= 5) return "text-warning";
  return "text-foreground";
}
