import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { findingsState, monitoredDomains, integrations } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { AddDomainForm } from "./add-domain-form";

export const runtime = "nodejs";

export default async function Dashboard() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard");

  const rows = await db.select({
    id: monitoredDomains.id, host: monitoredDomains.host, lastScore: monitoredDomains.lastScore,
    lastRunAt: monitoredDomains.lastRunAt, lastFullRunAt: monitoredDomains.lastFullRunAt,
    openCount: sql<number>`count(${findingsState.id}) filter (where ${findingsState.status} = 'open')::int`.as("open_count"),
  })
    .from(monitoredDomains)
    .leftJoin(findingsState, eq(findingsState.domainId, monitoredDomains.id))
    .where(eq(monitoredDomains.userId, session.user.id))
    .groupBy(monitoredDomains.id);

  const gscConnected = await db.select().from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc"))).limit(1);

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl tracking-tight">Your portfolio</h1>
        <Link href="/dashboard/queue" className="text-sm text-primary hover:underline">Fix queue →</Link>
      </div>

      <div className="mt-8 rounded-[22px] border border-border/70 bg-card/60 p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Add a domain</h2>
        <AddDomainForm />
      </div>

      <div className="mt-8 overflow-hidden rounded-[22px] border border-border/70 bg-card">
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
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="p-10 text-center text-sm text-muted-foreground">
                No domains yet. Add one above.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                <td className="py-3.5 pl-5 pr-4">
                  <Link href={`/dashboard/domains/${r.id}`} className="font-medium hover:text-primary hover:underline">
                    {r.host}
                  </Link>
                </td>
                <td className="py-3.5 pr-4 font-mono">{r.lastScore ?? "—"}</td>
                <td className="py-3.5 pr-4">
                  <Link href={`/dashboard/queue?domain=${r.id}`} className="hover:underline">{r.openCount}</Link>
                </td>
                <td className="py-3.5 pr-4 text-muted-foreground">{r.lastRunAt ? r.lastRunAt.toISOString().slice(0, 10) : "—"}</td>
                <td className="py-3.5 pr-5 text-right">{gscConnected.length ? "✓" : <Link href="/dashboard/integrations" className="text-primary hover:underline">Connect</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
