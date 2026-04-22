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

  const gscConnected = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.userId, userId), eq(integrations.kind, "gsc")))
    .limit(1);

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
          {domains.map((r) => (
            <tr key={r.id} className="border-b border-border/60 last:border-b-0">
              <td className="py-3.5 pl-5 pr-4">
                <Link href={`/dashboard/${encodeURIComponent(r.host)}`} className="font-medium hover:text-primary hover:underline">
                  {r.host}
                </Link>
              </td>
              <td className="py-3.5 pr-4 font-mono">{r.lastScore ?? "—"}</td>
              <td className="py-3.5 pr-4">
                <Link href={`/dashboard/queue?domain=${encodeURIComponent(r.host)}`} className="hover:underline">
                  {countMap.get(r.id) ?? 0}
                </Link>
              </td>
              <td className="py-3.5 pr-4 text-muted-foreground">
                {r.lastRunAt ? r.lastRunAt.toISOString().slice(0, 10) : "—"}
              </td>
              <td className="py-3.5 pr-5 text-right">
                {gscConnected.length ? (
                  "✓"
                ) : (
                  <Link href="/dashboard/integrations" className="text-primary hover:underline">
                    Connect
                  </Link>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
