// apps/web/src/app/dashboard/queue/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { snoozeFinding, dismissFinding } from "./actions";

export const runtime = "nodejs";
const PAGE_SIZE = 50;

export default async function FixQueuePage({
  searchParams,
}: { searchParams: Promise<{ page?: string; domain?: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/queue");
  const { page: pageParam, domain } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = [eq(monitoredDomains.userId, session.user.id), eq(findingsState.status, "open")];
  if (domain) where.push(eq(findingsState.domainId, domain));

  const rows = await db.select({
    id: findingsState.id, ruleId: findingsState.ruleId, message: findingsState.ruleMessageLatest,
    severity: findingsState.severityLatest, affected: findingsState.affectedPageCount,
    rank: findingsState.rankScore, signature: findingsState.templateSignature,
    host: monitoredDomains.host, domainId: monitoredDomains.id, representativeUrl: findingsState.representativeUrl,
  })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...where))
    .orderBy(desc(findingsState.rankScore))
    .limit(PAGE_SIZE)
    .offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...where));

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Suppressed-findings counter (visible so dismissals don't silently hide the tool's value — per spec §14).
  const suppressedCountQuery = [eq(monitoredDomains.userId, session.user.id), sql`${findingsState.status} <> 'open'`];
  if (domain) suppressedCountQuery.push(eq(findingsState.domainId, domain));
  const [{ suppressedCount }] = await db.select({ suppressedCount: sql<number>`count(*)::int` })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...suppressedCountQuery));

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl tracking-tight">Fix queue</h1>
        <a href={`/api/dashboard/queue/export.csv${domain ? `?domain=${domain}` : ""}`} className="text-sm text-primary hover:underline">
          Export CSV
        </a>
      </div>

      {suppressedCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {suppressedCount} suppressed finding{suppressedCount === 1 ? "" : "s"} — <Link href="/dashboard/queue/suppressed" className="text-primary hover:underline">review</Link>
        </p>
      )}

      <div className="mt-8 overflow-hidden rounded-[22px] border border-border/70 bg-card">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No open findings. Either you&apos;re very clean or nothing has been audited yet.</p>
        ) : rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-4 border-b border-border/60 p-5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                <span className={severityTone(r.severity)}>{r.severity}</span>
                <span>·</span>
                <span>{r.ruleId}</span>
                <span>·</span>
                <span>{r.host}</span>
              </div>
              <p className="mt-1 text-sm text-foreground">{r.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Template: <code className="font-mono">{r.signature}</code> · {r.affected} page{r.affected === 1 ? "" : "s"}
                {r.representativeUrl ? <> · <a href={r.representativeUrl} className="hover:underline" target="_blank" rel="noreferrer">example</a></> : null}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <form action={async () => { "use server"; await snoozeFinding(r.id, 90); }}>
                <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">Snooze 90d</button>
              </form>
              <form action={async () => { "use server"; await dismissFinding(r.id); }}>
                <button type="submit" className="text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
              </form>
            </div>
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href={`/dashboard/queue?page=${Math.max(1, page - 1)}${domain ? `&domain=${domain}` : ""}`}
                className={page <= 1 ? "pointer-events-none text-muted-foreground" : "text-primary hover:underline"}>
            ← Previous
          </Link>
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Link href={`/dashboard/queue?page=${Math.min(totalPages, page + 1)}${domain ? `&domain=${domain}` : ""}`}
                className={page >= totalPages ? "pointer-events-none text-muted-foreground" : "text-primary hover:underline"}>
            Next →
          </Link>
        </div>
      )}
    </main>
  );
}

function severityTone(s: string): string {
  if (s === "critical") return "text-destructive";
  if (s === "error") return "text-destructive";
  if (s === "warning") return "text-warning";
  return "text-muted-foreground";
}
