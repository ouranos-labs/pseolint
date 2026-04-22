import Link from "next/link";

type Run = {
  slug: string;
  score: number | null;
  status: "queued" | "running" | "completed" | "failed" | "expired";
  completedAt: Date | null;
};

export function TimelineStrip({ runs }: { runs: Run[] }) {
  if (!runs.length) {
    return <p className="text-xs text-muted-foreground">No runs yet — initial audit is queued.</p>;
  }
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Last 30 days</h2>
      <ol className="flex flex-wrap gap-1.5">
        {runs.map((r, idx) => {
          const prevScore = runs[idx + 1]?.score ?? null;
          const delta = r.score != null && prevScore != null ? r.score - prevScore : null;
          const hue = delta == null
            ? "bg-muted"
            : delta >= 0
              ? "bg-primary/70"
              : "bg-destructive/70";
          const title =
            `${r.status === "completed" ? `Score ${r.score}` : r.status}` +
            (delta != null ? ` (${delta >= 0 ? "+" : ""}${delta})` : "") +
            (r.completedAt ? ` · ${new Date(r.completedAt).toLocaleString()}` : "");
          return (
            <li key={r.slug}>
              <Link href={`/r/${r.slug}`} title={title} className={`block h-6 w-3 rounded-sm ${hue} opacity-80 hover:opacity-100`} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
