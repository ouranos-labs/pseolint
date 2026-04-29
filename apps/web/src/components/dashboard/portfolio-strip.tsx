import Link from "next/link";
import { db } from "@/db";
import { findingsState, monitoredDomains, integrations } from "@/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

type DomainRow = typeof monitoredDomains.$inferSelect;

interface PortfolioStripProps {
  domains: DomainRow[];
  userId: string;
}

export async function PortfolioStrip({ domains, userId }: PortfolioStripProps) {
  const domainIds = domains.map((d) => d.id);

  const counts =
    domainIds.length > 0
      ? await db
          .select({
            domainId: findingsState.domainId,
            openCount: sql<number>`count(${findingsState.id}) filter (where ${findingsState.status} = 'open')::int`.as("open_count"),
          })
          .from(findingsState)
          .where(inArray(findingsState.domainId, domainIds))
          .groupBy(findingsState.domainId)
      : [];

  const countMap = new Map(counts.map((c) => [c.domainId, c.openCount]));

  // User-level GSC grant (one row per user, kind='gsc'). Per-domain binding is
  // checked via `domain.gscSiteUrl` below — the OAuth grant alone is not enough
  // to weight findings; each domain still needs a bound property.
  const [gscIntegration] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, "gsc")))
    .limit(1);
  const gscGrantExists = Boolean(gscIntegration);

  return (
    <div className="overflow-hidden rounded-[22px] border border-border/70 bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-card/80 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-3 pl-5 pr-4">Domain</th>
            <th className="py-3 pr-4">Score</th>
            <th className="py-3 pr-4">Open findings</th>
            <th className="py-3 pr-4">Last audit</th>
            <th className="py-3 pr-5 text-right">GSC</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((r) => {
            const unverified = !r.verifiedAt;
            const noRunsYet = !r.lastRunAt;
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
                <td className="py-3.5 pr-4 font-mono">{r.lastRisk ?? "—"}</td>
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
