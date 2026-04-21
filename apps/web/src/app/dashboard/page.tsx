import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { audits, monitoredDomains } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { AddDomainForm } from "./add-domain-form";
import { DomainRowActions } from "./domain-row-actions";

export const runtime = "nodejs";

export default async function Dashboard() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard");

  const rows = await db
    .select()
    .from(monitoredDomains)
    .where(eq(monitoredDomains.userId, session.user.id))
    .orderBy(desc(monitoredDomains.createdAt));

  const monthCutoff = new Date();
  monthCutoff.setUTCDate(1);
  monthCutoff.setUTCHours(0, 0, 0, 0);
  const [usage] = await db
    .select({
      auditCount: sql<number>`count(*)::int`.as("audit_count"),
      pageSum: sql<number>`coalesce(sum(${audits.pageCount}), 0)::int`.as("page_sum"),
    })
    .from(audits)
    .where(and(eq(audits.userId, session.user.id), gte(audits.createdAt, monthCutoff)));
  const auditsThisMonth = usage?.auditCount ?? 0;
  const pagesThisMonth = usage?.pageSum ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
        Monitoring
      </div>
      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        Your monitored domains
      </h1>
      <p className="mt-3 max-w-xl text-sm text-muted-foreground">
        Weekly re-audits. Email alert when your risk score shifts by 10 points or a new
        error-severity rule starts firing. Manage cadence, pause, or remove at any time.
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <UsageStat label="Monitored domains" value={rows.length} />
        <UsageStat label="Audits this month" value={auditsThisMonth} />
        <UsageStat label="Pages fetched this month" value={pagesThisMonth} />
      </div>

      <div className="mt-8 rounded-[28px] border border-border/70 bg-card/60 p-6 backdrop-blur-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Add a domain to monitor
        </h2>
        <AddDomainForm />
      </div>

      <div className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Watching {rows.length}
          {rows.length === 1 ? " domain" : " domains"}
        </h2>

        {rows.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-border/60 bg-card/40 p-10 text-center text-sm text-muted-foreground">
            No domains monitored yet. Add one above — or hit <Link href="/" className="text-primary hover:underline">Run audit</Link> first to try it.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card/80 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-3 pl-5 pr-4 font-medium">Domain</th>
                  <th className="py-3 pr-4 font-medium">Score</th>
                  <th className="py-3 pr-4 font-medium">Cadence</th>
                  <th className="py-3 pr-4 font-medium">Next run</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 last:border-b-0">
                    <td className="py-3.5 pl-5 pr-4">
                      <Link
                        href={r.lastAuditId ? `/r/${r.lastAuditId}` : "/dashboard"}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {r.host}
                      </Link>
                      <div className="font-mono text-[11px] text-muted-foreground">{shortPath(r.sourceUrl)}</div>
                    </td>
                    <td className="py-3.5 pr-4">
                      {r.lastScore == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={`font-mono font-semibold ${scoreTone(r.lastScore)}`}>{r.lastScore}</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4 capitalize text-muted-foreground">{r.cadence}</td>
                    <td className="py-3.5 pr-4 text-muted-foreground">
                      {r.paused ? "—" : relTime(r.nextRunAt)}
                    </td>
                    <td className="py-3.5 pr-4">
                      {r.paused ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                          paused
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-success">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                          active
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 pr-5 text-right">
                      <DomainRowActions id={r.id} paused={r.paused} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function UsageStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[22px] border border-border/60 bg-card/40 p-5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl tabular-nums text-foreground">
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function scoreTone(score: number): string {
  if (score <= 40) return "text-success";
  if (score <= 69) return "text-warning";
  return "text-destructive";
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === "/" ? "" : u.pathname;
    return `${u.host}${p}`;
  } catch {
    return url;
  }
}

function relTime(d: Date): string {
  const diffMs = d.getTime() - Date.now();
  if (diffMs <= 0) return "soon";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs}h`;
  const days = Math.round(hrs / 24);
  return `in ${days}d`;
}
