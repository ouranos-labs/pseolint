import Link from "next/link";
import { db } from "@/db";
import { audits, findingsState, monitoredDomains, integrations } from "@/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";

type DomainRow = typeof monitoredDomains.$inferSelect;

interface PortfolioStripProps {
  domains: DomainRow[];
  userId: string;
}

type TrendPoint = { risk: number; t: number };

export async function PortfolioStrip({ domains, userId }: PortfolioStripProps) {
  const domainIds = domains.map((d) => d.id);
  const sourceUrls = domains.map((d) => d.sourceUrl);
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [counts, gscIntegration, runs] = await Promise.all([
    domainIds.length > 0
      ? db
          .select({
            domainId: findingsState.domainId,
            openCount: sql<number>`count(${findingsState.id}) filter (where ${findingsState.status} = 'open')::int`.as("open_count"),
          })
          .from(findingsState)
          .where(inArray(findingsState.domainId, domainIds))
          .groupBy(findingsState.domainId)
      : Promise.resolve([] as { domainId: string; openCount: number }[]),
    // User-level GSC grant (one row per user, kind='gsc'). Per-domain binding is
    // checked via `domain.gscSiteUrl` below — the OAuth grant alone is not enough
    // to weight findings; each domain still needs a bound property.
    db
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.kind, "gsc")))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    // 30-day completed-run history across all of this user's monitored domains,
    // grouped client-side by sourceUrl. Single query is cheaper than N per-domain
    // ones, and 30d × N sites stays in the low hundreds even for power users.
    sourceUrls.length > 0
      ? db
          .select({
            sourceUrl: audits.sourceUrl,
            risk: audits.risk,
            completedAt: audits.completedAt,
          })
          .from(audits)
          .where(and(
            eq(audits.userId, userId),
            eq(audits.status, "completed"),
            inArray(audits.sourceUrl, sourceUrls),
            gte(audits.createdAt, since),
          ))
      : Promise.resolve([] as { sourceUrl: string; risk: number | null; completedAt: Date | null }[]),
  ]);

  const countMap = new Map(counts.map((c) => [c.domainId, c.openCount]));
  const gscGrantExists = Boolean(gscIntegration);

  const trendsBySource = new Map<string, TrendPoint[]>();
  for (const r of runs) {
    if (r.risk == null || r.completedAt == null) continue;
    const arr = trendsBySource.get(r.sourceUrl) ?? [];
    arr.push({ risk: r.risk, t: r.completedAt.getTime() });
    trendsBySource.set(r.sourceUrl, arr);
  }
  for (const arr of trendsBySource.values()) arr.sort((a, b) => a.t - b.t);

  return (
    <div className="overflow-hidden rounded-[22px] border border-border/70 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card/80 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-3 pl-5 pr-4">Domain</th>
            <th className="py-3 pr-4">Score</th>
            <th className="py-3 pr-4">30d trend</th>
            <th className="py-3 pr-4">Open findings</th>
            <th className="py-3 pr-4">Last audit</th>
            <th className="py-3 pr-5 text-right">GSC</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((r) => {
            const unverified = !r.verifiedAt;
            const noRunsYet = !r.lastRunAt;
            const trend = trendsBySource.get(r.sourceUrl) ?? [];
            return (
              <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                <td className="py-3.5 pl-5 pr-4">
                  <Link href={`/dashboard/${encodeURIComponent(r.host)}`} className="font-medium hover:text-primary hover:underline">
                    {r.host}
                  </Link>
                  {unverified && (
                    <Link
                      href={`/dashboard/${encodeURIComponent(r.host)}`}
                      className="ml-2 inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning hover:bg-warning/20"
                    >
                      Verify ownership
                    </Link>
                  )}
                </td>
                <td className={`py-3.5 pr-4 font-mono ${scoreTone(r.lastRisk)}`}>
                  {r.lastRisk ?? "—"}
                </td>
                <td className="py-3.5 pr-4">
                  <Sparkline points={trend} />
                </td>
                <td className="py-3.5 pr-4">
                  <Link href={`/dashboard/${encodeURIComponent(r.host)}`} className="hover:underline">
                    {countMap.get(r.id) ?? 0}
                  </Link>
                </td>
                <td className="py-3.5 pr-4 text-muted-foreground">
                  {unverified
                    ? <span className="text-warning">Pending verification</span>
                    : noRunsYet
                      ? <span>Audit queued</span>
                      : r.lastRunAt!.toISOString().slice(0, 10)}
                </td>
                <td className="py-3.5 pr-5 text-right">
                  <GscCell host={r.host} grantExists={gscGrantExists} siteUrl={r.gscSiteUrl} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Per-domain GSC state. Three distinct states matter — collapsing them to a
 * binary "✓ / Connect" hides the silent-failure case (grant exists but no
 * property bound) which leaves rank scores unweighted by traffic.
 */
function GscCell({
  host,
  grantExists,
  siteUrl,
}: {
  host: string;
  grantExists: boolean;
  siteUrl: string | null;
}) {
  if (!grantExists) {
    return (
      <Link href="/dashboard/integrations" className="text-xs text-primary hover:underline">
        Connect
      </Link>
    );
  }
  if (!siteUrl) {
    return (
      <Link
        href={`/dashboard/${encodeURIComponent(host)}/settings`}
        className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning hover:bg-warning/20"
        title="Search Console is connected but no property is bound to this domain — findings here aren't traffic-weighted"
      >
        Bind →
      </Link>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[11px] text-success"
      title={`Bound to ${siteUrl} — findings ranked by traffic-at-risk`}
    >
      <span className="inline-block h-1 w-1 rounded-full bg-success" />
      Bound
    </span>
  );
}

/**
 * Per-domain risk-trend sparkline. Lets the user scan a multi-domain portfolio
 * for "which one is regressing?" without drilling in. Tone is keyed off the
 * latest run's score band so the eye reads color = current risk, slope =
 * direction. Cold-start state (<2 completed runs) renders a dash so the column
 * doesn't shift width.
 */
function Sparkline({ points }: { points: TrendPoint[] }) {
  const W = 80;
  const H = 20;
  if (points.length < 2) {
    return (
      <span
        className="inline-block font-mono text-[11px] text-muted-foreground/60"
        title="Need two completed runs to chart a trend"
      >
        —
      </span>
    );
  }
  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);
  const x = (t: number) => ((t - tMin) / tSpan) * W;
  const y = (r: number) => (1 - Math.min(100, Math.max(0, r)) / 100) * H;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.risk).toFixed(1)}`)
    .join(" ");
  const latest = points[points.length - 1];
  const first = points[0];
  const delta = latest.risk - first.risk;
  const tone = scoreTone(latest.risk);
  const directionLabel = delta < 0 ? "improving" : delta > 0 ? "regressing" : "flat";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-5 w-20 ${tone}`}
      role="img"
      aria-label={`30-day risk trend, ${directionLabel}`}
    >
      <title>{`30d trend · ${directionLabel} (${first.risk} → ${latest.risk})`}</title>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={x(latest.t)} cy={y(latest.risk)} r="1.8" fill="currentColor" />
    </svg>
  );
}

function scoreTone(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score < 20) return "text-success";
  if (score < 40) return "text-primary";
  if (score < 60) return "text-warning";
  return "text-destructive";
}
