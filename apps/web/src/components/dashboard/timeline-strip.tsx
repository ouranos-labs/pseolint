import Link from "next/link";

type Run = {
  slug: string;
  score: number | null;
  status: "queued" | "running" | "completed" | "failed" | "expired" | string;
  completedAt: Date | null;
};

export function TimelineStrip({ runs }: { runs: Run[] }) {
  // Order in DB query is desc(createdAt) — flip to oldest→newest for the strip
  // so the eye reads time left-to-right.
  const ordered = [...runs].reverse();
  const completedRuns = ordered.filter((r) => r.status === "completed" && r.score != null);
  const oldest = completedRuns[0]?.completedAt ?? null;
  const newest = completedRuns[completedRuns.length - 1]?.completedAt ?? null;

  return (
    <section className="rounded-[18px] border border-border/60 bg-card/40 p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Run history · last 30 days</h2>
        <span className="font-mono text-[11px] text-muted-foreground">
          {ordered.length} audit{ordered.length === 1 ? "" : "s"}
        </span>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        One bar per audit, oldest → newest. Color shows score change vs. previous run — green is an
        improvement (score went down — lower is safer), red is a regression. Click a bar to open that report.
      </p>

      {ordered.length === 0 ? (
        <p className="mt-4 rounded-[12px] border border-dashed border-border/60 bg-background/40 p-4 text-center text-xs text-muted-foreground">
          No audits yet. Your first run will appear here as soon as it completes — usually within a minute.
        </p>
      ) : (
        <>
          <ol className="mt-4 flex flex-wrap items-end gap-1.5">
            {ordered.map((r, idx) => {
              const prevScore = ordered[idx - 1]?.score ?? null;
              const delta =
                r.score != null && prevScore != null ? r.score - prevScore : null;

              // Lower score is safer (less SpamBrain risk). So delta < 0 = improvement = green;
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
                  ? `Score ${r.score}` +
                    (delta != null
                      ? ` (${delta >= 0 ? "+" : ""}${delta} vs. prior)`
                      : " · first run") +
                    (r.completedAt ? ` · ${new Date(r.completedAt).toLocaleString()}` : "")
                  : `${r.status}${r.completedAt ? ` · ${new Date(r.completedAt).toLocaleString()}` : ""}`;

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
