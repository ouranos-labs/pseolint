import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { growthSearchMetrics } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { isOwnerEmail } from "@/lib/owner";
import { growthIndexationSummary, publishedGrowthUrls, type GrowthMetricRow } from "@/lib/growth-metrics";

export const metadata = { robots: { index: false, follow: false } };

export default async function GrowthDashboard() {
  const session = await getOptionalSession();
  if (!isOwnerEmail(session?.user?.email)) notFound();

  // Latest week bucket present in the table.
  const [latest] = await db
    .select({ weekBucket: growthSearchMetrics.weekBucket })
    .from(growthSearchMetrics)
    .orderBy(desc(growthSearchMetrics.weekBucket))
    .limit(1);

  if (!latest) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Growth — self-measurement</h1>
        <p>No data yet. The first sync runs Monday 04:00 UTC (requires GROWTH_GSC_* configured and an owner GSC grant).</p>
      </main>
    );
  }

  const rows = await db
    .select()
    .from(growthSearchMetrics)
    .where(eq(growthSearchMetrics.weekBucket, latest.weekBucket));

  const pageRows: GrowthMetricRow[] = rows
    .filter((r) => r.query === "")
    .map((r) => ({
      url: r.url,
      query: "",
      impressions: r.impressions,
      clicks: r.clicks,
      positionAvg: r.positionAvg == null ? null : Number(r.positionAvg),
      ctrAvg: r.ctrAvg == null ? null : Number(r.ctrAvg),
    }))
    .sort((a, b) => b.impressions - a.impressions);

  const summary = growthIndexationSummary(publishedGrowthUrls(), pageRows);

  return (
    <main style={{ padding: 24 }}>
      <h1>Growth — self-measurement</h1>
      <p>Week {latest.weekBucket}</p>
      <p>
        <strong>Indexation rate:</strong> {summary.withImpressions}/{summary.published} growth pages
        surfacing in search ({summary.indexationRatePct}%)
      </p>
      <table cellPadding={6} style={{ borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th>Page</th><th>Impr.</th><th>Clicks</th><th>Avg pos.</th><th>CTR</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => (
            <tr key={r.url} style={{ borderBottom: "1px solid #eee" }}>
              <td>{new URL(r.url).pathname}</td>
              <td>{r.impressions}</td>
              <td>{r.clicks}</td>
              <td>{r.positionAvg == null ? "—" : r.positionAvg.toFixed(1)}</td>
              <td>{r.ctrAvg == null ? "—" : `${(r.ctrAvg * 100).toFixed(1)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
