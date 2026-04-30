"use client";

import Link from "next/link";
import { useState } from "react";

type Run = {
  slug: string;
  risk: number | null;
  status: "queued" | "running" | "completed" | "failed" | "expired" | string;
  completedAt: Date | null;
};

export function TimelineStrip({ runs }: { runs: Run[] }) {
  const [compareMode, setCompareMode] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);

  // Order in DB query is desc(createdAt) — flip to oldest→newest for the strip
  // so the eye reads time left-to-right.
  const ordered = [...runs].reverse();
  const completedRuns = ordered.filter((r) => r.status === "completed" && r.risk != null);
  const oldest = completedRuns[0]?.completedAt ?? null;
  const newest = completedRuns[completedRuns.length - 1]?.completedAt ?? null;

  const toggleSelected = (slug: string) => {
    setSelectedSlugs((prev) => {
      if (prev.includes(slug)) {
        return prev.filter((s) => s !== slug);
      }
      if (prev.length < 2) {
        return [...prev, slug];
      }
      // Replace slot 0 — keep slot 1 as "the latest pick".
      return [prev[1]!, slug];
    });
  };

  const toggleCompareMode = () => {
    if (compareMode) {
      setSelectedSlugs([]);
      setCompareMode(false);
    } else {
      setCompareMode(true);
    }
  };

  const banner =
    selectedSlugs.length === 0
      ? "Click any two completed runs to compare"
      : selectedSlugs.length === 1
        ? "Pick one more to compare · 1 of 2 selected"
        : "Ready · 2 of 2 selected";

  return (
    <section className="rounded-[18px] border border-border/60 bg-card/40 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Run history · last 30 days</h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {ordered.length} audit{ordered.length === 1 ? "" : "s"}
          </span>
          {ordered.length > 0 && (
            <button
              type="button"
              onClick={toggleCompareMode}
              aria-pressed={compareMode}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                compareMode
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:bg-card"
              }`}
            >
              {compareMode ? "Cancel" : "Compare runs"}
            </button>
          )}
        </div>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        One bar per audit, oldest → newest. Color shows risk change vs. previous run — green is an
        improvement (risk went down — lower is safer), red is a regression. Click a bar to open that report.
      </p>

      {ordered.length === 0 ? (
        <p className="mt-4 rounded-[12px] border border-dashed border-border/60 bg-background/40 p-4 text-center text-xs text-muted-foreground">
          No audits yet. Your first run will appear here as soon as it completes — usually within a minute.
        </p>
      ) : (
        <>
          <ol className="mt-4 flex flex-wrap items-end gap-1.5">
            {ordered.map((r, idx) => {
              const prevRisk = ordered[idx - 1]?.risk ?? null;
              const delta =
                r.risk != null && prevRisk != null ? r.risk - prevRisk : null;

              // Lower risk is safer (less SpamBrain exposure). So delta < 0 = improvement = green;
              // delta > 0 = regression = red. The previous version had this inverted.
              const hue =
                r.status !== "completed"
                  ? "bg-muted"
                  : delta == null
                    ? "bg-foreground/40"
                    : delta < 0
                      ? "bg-success/80"
                      : delta > 0
                        ? "bg-destructive/80"
                        : "bg-foreground/40";

              const title =
                r.status === "completed"
                  ? `Risk ${r.risk}` +
                    (delta != null
                      ? ` (${delta >= 0 ? "+" : ""}${delta} vs. prior)`
                      : " · first run") +
                    (r.completedAt ? ` · ${new Date(r.completedAt).toLocaleString()}` : "")
                  : `${r.status}${r.completedAt ? ` · ${new Date(r.completedAt).toLocaleString()}` : ""}`;

              const isSelected = selectedSlugs.includes(r.slug);
              const anySelected = selectedSlugs.length > 0;
              const isCompleted = r.status === "completed";

              if (compareMode) {
                if (!isCompleted) {
                  return (
                    <li key={r.slug}>
                      <span
                        title={title}
                        aria-disabled="true"
                        className={`block h-8 w-3.5 rounded-sm ${hue} cursor-not-allowed opacity-30`}
                      />
                    </li>
                  );
                }
                const dateLabel = r.completedAt
                  ? new Date(r.completedAt).toLocaleString()
                  : "unknown date";
                const ariaLabel = `Run on ${dateLabel}, risk ${r.risk}${
                  isSelected ? ", selected" : ""
                }`;
                return (
                  <li key={r.slug}>
                    <button
                      type="button"
                      onClick={() => toggleSelected(r.slug)}
                      title={title}
                      aria-pressed={isSelected}
                      aria-label={ariaLabel}
                      className={`block h-8 w-3.5 rounded-sm transition-opacity ${hue} ${
                        isSelected
                          ? "ring-2 ring-primary opacity-100"
                          : anySelected
                            ? "opacity-40 hover:opacity-80"
                            : "opacity-80 hover:opacity-100"
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                    />
                  </li>
                );
              }

              return (
                <li key={r.slug}>
                  <Link
                    href={`/r/${r.slug}`}
                    title={title}
                    className={`block h-8 w-3.5 rounded-sm transition-opacity ${hue} opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring`}
                  />
                </li>
              );
            })}
          </ol>

          {(oldest || newest) && (
            <div className="mt-2 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>{oldest ? new Date(oldest).toLocaleDateString() : ""}</span>
              <span>{newest ? new Date(newest).toLocaleDateString() : ""}</span>
            </div>
          )}

          {compareMode && (
            <div className="mt-3 flex items-center justify-between rounded-[12px] border border-primary/25 bg-primary/5 px-3 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">{banner}</span>
              {selectedSlugs.length === 2 && (
                <Link
                  href={`/r/compare?a=${selectedSlugs[0]}&b=${selectedSlugs[1]}`}
                  className="inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary hover:bg-primary/20"
                >
                  Compare →
                </Link>
              )}
            </div>
          )}

          <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success/80" /> Improved
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-destructive/80" /> Regressed
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-foreground/40" /> Flat / first run
            </li>
            <li className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted" /> Not completed
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
