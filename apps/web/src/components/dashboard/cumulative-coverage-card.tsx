interface CumulativeCoverageCardProps {
  urlsAuditedTotal: number;
  urlsAuditedLast30d: number;
}

/**
 * v0.5.3 "Coverage you can prove" card. Reframes the per-run "200 URLs/week"
 * cron number as the cumulative URL count this domain's audit history has
 * built up. We sum `audits.pageCount` across all completed runs: this is
 * total URLs *audited*, not deduplicated distinct URLs (computing distinct
 * would require reading per-audit URL lists out of R2 on every page-view,
 * which is too heavy for v0.5.3). The label reflects that limit honestly.
 */
export function CumulativeCoverageCard({
  urlsAuditedTotal,
  urlsAuditedLast30d,
}: CumulativeCoverageCardProps) {
  return (
    <section className="rounded-[18px] border border-border/60 bg-card/40 px-5 py-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Cumulative coverage
      </p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span
          className="font-mono text-3xl tabular-nums text-foreground"
          title="Total URLs audited across all completed monitoring runs for this domain. Diff-mode skips URLs that haven't changed; this number sums URLs the auditor actually fetched per run, so URLs re-checked across multiple runs are counted each time."
        >
          {urlsAuditedTotal.toLocaleString()}
        </span>
        <span className="text-sm text-muted-foreground">
          URLs audited (cumulative)
        </span>
        <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{urlsAuditedLast30d.toLocaleString()}</span>{" "}
          audited in last 30d
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Pro monitoring re-fetches up to 200 URLs per monitoring run, diff-aware.
        Unchanged URLs carry forward their findings without a re-fetch: the count
        above is what was actually fetched, summed across runs.
      </p>
    </section>
  );
}
