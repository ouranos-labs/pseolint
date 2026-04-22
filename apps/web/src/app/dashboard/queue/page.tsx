// apps/web/src/app/dashboard/queue/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
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
  const { page: pageParam, domain: domainFilterSlug } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Resolve slug → domainId (ownership-checked, not removed).
  let domainId: string | null = null;
  let domainHost: string | null = null;
  let domainNotFound = false;
  if (domainFilterSlug) {
    const domainRow = await db
      .select({ id: monitoredDomains.id, host: monitoredDomains.host })
      .from(monitoredDomains)
      .where(
        and(
          eq(monitoredDomains.slug, domainFilterSlug),
          eq(monitoredDomains.userId, session.user.id),
          isNull(monitoredDomains.removedAt),
        ),
      )
      .limit(1);
    if (domainRow.length === 0) {
      domainNotFound = true;
    } else {
      domainId = domainRow[0].id;
      domainHost = domainRow[0].host;
    }
  }

  const where = [eq(monitoredDomains.userId, session.user.id), eq(findingsState.status, "open")];
  if (domainId) where.push(eq(findingsState.domainId, domainId));

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
  if (domainId) suppressedCountQuery.push(eq(findingsState.domainId, domainId));
  const [{ suppressedCount }] = await db.select({ suppressedCount: sql<number>`count(*)::int` })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...suppressedCountQuery));

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl tracking-tight">Fix queue</h1>
        <a href={`/api/dashboard/queue/export.csv${domainFilterSlug ? `?domain=${domainFilterSlug}` : ""}`} className="text-sm text-primary hover:underline">
          Export CSV
        </a>
      </div>

      {suppressedCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {suppressedCount} suppressed finding{suppressedCount === 1 ? "" : "s"} — <Link href="/dashboard/queue/suppressed" className="text-primary hover:underline">review</Link>
        </p>
      )}

      {domainFilterSlug && (
        <div className="mt-4">
          {domainNotFound ? (
            <p className="text-xs text-muted-foreground">Domain not found or not accessible.</p>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs">
              <span className="text-muted-foreground">Filtered to</span>
              <span className="font-mono text-foreground">{domainHost ?? domainFilterSlug}</span>
              <a href="/dashboard/queue" className="text-muted-foreground hover:text-foreground" aria-label="Clear filter">×</a>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-[22px] border border-border/70 bg-card">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            {domainNotFound
              ? "Domain not found or not accessible."
              : "No open findings. Either you\u2019re very clean or nothing has been audited yet."}
          </p>
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
          <Link href={`/dashboard/queue?page=${Math.max(1, page - 1)}${domainFilterSlug ? `&domain=${domainFilterSlug}` : ""}`}
                className={page <= 1 ? "pointer-events-none text-muted-foreground" : "text-primary hover:underline"}>
            ← Previous
          </Link>
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Link href={`/dashboard/queue?page=${Math.min(totalPages, page + 1)}${domainFilterSlug ? `&domain=${domainFilterSlug}` : ""}`}
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
