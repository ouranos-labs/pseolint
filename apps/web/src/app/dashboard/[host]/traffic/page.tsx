import { GscStatusStrip } from "@/components/dashboard/gsc-status-strip";
import { getGscSnapshot, getWorkspaceDomain } from "../_data";

export const runtime = "nodejs";

/**
 * Search Console tab. Owns the per-URL metrics scan (capped at 2000 rows), the
 * single most expensive query in the workspace. Before the split it ran on
 * every workspace visit just to decide whether to draw a status pill; now it
 * only runs when the operator actually asks about traffic.
 */
export default async function WorkspaceTraffic({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: rawHost } = await params;
  const [domain, gsc] = await Promise.all([
    getWorkspaceDomain(rawHost),
    getGscSnapshot(rawHost),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <GscStatusStrip
        variant={gsc.variant}
        host={domain.host}
        siteUrl={gsc.siteUrl}
        totalImpressions={gsc.totalImpressions}
        totalClicks={gsc.totalClicks}
        lastSyncAt={gsc.lastSyncAt}
        monthlyTrend={gsc.monthlyTrend}
        topTemplates={gsc.topTemplates}
        weightedAvgPosition={gsc.weightedAvgPosition}
        ctr={gsc.ctr}
      />

      {gsc.variant === "bound-with-data" && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Impressions and clicks are the current month, aggregated per template
          signature. The same numbers weight the rank score behind each finding
          on the Overview tab, so a finding on a high-traffic template outranks
          the same finding on a page nobody sees.
        </p>
      )}
    </div>
  );
}
