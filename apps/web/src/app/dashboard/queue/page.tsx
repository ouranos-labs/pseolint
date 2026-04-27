// apps/web/src/app/dashboard/queue/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { findingsState, monitoredDomains, userProfiles } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { snoozeFinding, dismissFinding } from "./actions";

export const runtime = "nodejs";
const PAGE_SIZE = 50;

export default async function FixQueuePage({
  searchParams,
}: { searchParams: Promise<{ page?: string; domain?: string; show?: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?callbackUrl=/dashboard/queue");
  const { page: pageParam, domain: domainFilterRaw, show } = await searchParams;
  const domainFilterHost = domainFilterRaw ? decodeURIComponent(domainFilterRaw) : null;
  const showSuppressed = show === "suppressed";
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Read previous-visit timestamp BEFORE we advance it. Used to flag new findings
  // and to render the "what's new since you last visited" callout. Null means
  // first-ever visit — every open row counts as new.
  const [profileRow] = await db.select({ at: userProfiles.queueLastVisitedAt })
    .from(userProfiles).where(eq(userProfiles.userId, session.user.id)).limit(1);
  const lastVisitedAt = profileRow?.at ?? null;

  // Resolve host → domainId (ownership-checked, not removed).
  let domainId: string | null = null;
  let domainHost: string | null = null;
  let domainNotFound = false;
  if (domainFilterHost) {
    const domainRow = await db
      .select({ id: monitoredDomains.id, host: monitoredDomains.host })
      .from(monitoredDomains)
      .where(
        and(
          eq(monitoredDomains.host, domainFilterHost),
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

  const where = [eq(monitoredDomains.userId, session.user.id)];
  if (showSuppressed) {
    where.push(sql`${findingsState.status} <> 'open'`);
  } else {
    where.push(eq(findingsState.status, "open"));
  }
  if (domainId) where.push(eq(findingsState.domainId, domainId));

  // Diagnose the empty state — counts at portfolio level, no domain filter applied,
  // so the message can distinguish "no domains added yet" from "domains pending verification"
  // from "audits queued but no findings yet" from "everything cleared/dismissed."
  const [{ totalDomains }] = await db.select({ totalDomains: sql<number>`count(*)::int` })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, session.user.id), isNull(monitoredDomains.removedAt)));
  const [{ unverifiedDomains }] = await db.select({ unverifiedDomains: sql<number>`count(*)::int` })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
      isNull(monitoredDomains.verifiedAt),
    ));
  const [{ verifiedNoRuns }] = await db.select({ verifiedNoRuns: sql<number>`count(*)::int` })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
      isNotNull(monitoredDomains.verifiedAt),
      isNull(monitoredDomains.lastRunAt),
    ));

  const rows = await db.select({
    id: findingsState.id, ruleId: findingsState.ruleId, message: findingsState.ruleMessageLatest,
    severity: findingsState.severityLatest, affected: findingsState.affectedPageCount,
    rank: findingsState.rankScore, signature: findingsState.templateSignature,
    host: monitoredDomains.host, domainId: monitoredDomains.id, representativeUrl: findingsState.representativeUrl,
    firstSeenAt: findingsState.firstSeenAt,
  })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...where))
    .orderBy(desc(findingsState.rankScore))
    .limit(PAGE_SIZE)
    .offset(offset);

  // "New since last visit" — only meaningful for the open queue (not the suppressed view).
  // Counted across the whole filtered set (not just this page) so the strip number doesn't
  // shrink as the user paginates.
  const newSinceWhere = [
    eq(monitoredDomains.userId, session.user.id),
    eq(findingsState.status, "open"),
  ];
  if (domainId) newSinceWhere.push(eq(findingsState.domainId, domainId));
  if (lastVisitedAt) newSinceWhere.push(gt(findingsState.firstSeenAt, lastVisitedAt));
  const newSinceCount = showSuppressed
    ? 0
    : (await db.select({ c: sql<number>`count(*)::int` })
        .from(findingsState)
        .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
        .where(and(...newSinceWhere)))[0].c;

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...where));

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Advance the per-user "last visited" marker so the next visit's "since"
  // window starts here. Done after all reads — the reads above use the
  // PREVIOUS timestamp. Upsert because the profile row may not exist yet
  // for users who haven't hit the plan flow.
  const now = new Date();
  await db.insert(userProfiles)
    .values({ userId: session.user.id, queueLastVisitedAt: now })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: { queueLastVisitedAt: now },
    });

  // Suppressed-findings counter (visible so dismissals don't silently hide the tool's value — per spec §14).
  const suppressedCountQuery = [eq(monitoredDomains.userId, session.user.id), sql`${findingsState.status} <> 'open'`];
  if (domainId) suppressedCountQuery.push(eq(findingsState.domainId, domainId));
  const [{ suppressedCount }] = await db.select({ suppressedCount: sql<number>`count(*)::int` })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(and(...suppressedCountQuery));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl tracking-tight">{showSuppressed ? "Suppressed findings" : "Fix queue"}</h1>
        <a href={`/api/dashboard/queue/export.csv${domainFilterHost ? `?domain=${encodeURIComponent(domainFilterHost)}` : ""}`} className="text-sm text-primary hover:underline">
          Export CSV
        </a>
      </div>

      {showSuppressed ? (
        <p className="mt-3 text-xs">
          <Link href={`/dashboard/queue${domainFilterHost ? `?domain=${encodeURIComponent(domainFilterHost)}` : ""}`} className="text-primary hover:underline">
            ← Back to open findings
          </Link>
        </p>
      ) : suppressedCount > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {suppressedCount} suppressed finding{suppressedCount === 1 ? "" : "s"} — <Link href={`/dashboard/queue?show=suppressed${domainFilterHost ? `&domain=${encodeURIComponent(domainFilterHost)}` : ""}`} className="text-primary hover:underline">review</Link>
        </p>
      )}

      {!showSuppressed && newSinceCount > 0 && (
        <div className="rounded-[18px] border border-primary/40 bg-primary/5 px-5 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {newSinceCount} new finding{newSinceCount === 1 ? "" : "s"} since you last visited
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {lastVisitedAt
                  ? `Last visit: ${new Date(lastVisitedAt).toLocaleString()}. Marked NEW in the list below.`
                  : "First visit — every open finding is shown as new."}
              </p>
            </div>
          </div>
        </div>
      )}

      {domainFilterHost && (
        <div className="mt-4">
          {domainNotFound ? (
            <p className="text-xs text-muted-foreground">Domain not found or not accessible.</p>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs">
              <span className="text-muted-foreground">Filtered to</span>
              <span className="font-mono text-foreground">{domainHost ?? domainFilterHost}</span>
              <a href="/dashboard/queue" className="text-muted-foreground hover:text-foreground" aria-label="Clear filter">×</a>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 overflow-hidden rounded-[22px] border border-border/70 bg-card">
        {rows.length === 0 ? (
          <EmptyQueueState
            domainNotFound={domainNotFound}
            showSuppressed={showSuppressed}
            totalDomains={totalDomains}
            unverifiedDomains={unverifiedDomains}
            verifiedNoRuns={verifiedNoRuns}
            suppressedCount={suppressedCount}
          />
        ) : rows.map((r) => {
          const isNew = !showSuppressed && (lastVisitedAt == null || (r.firstSeenAt != null && r.firstSeenAt > lastVisitedAt));
          return (
          <div key={r.id} className="flex items-start justify-between gap-4 border-b border-border/60 p-5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                {isNew && (
                  <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    New
                  </span>
                )}
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
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href={`/dashboard/queue?page=${Math.max(1, page - 1)}${domainFilterHost ? `&domain=${encodeURIComponent(domainFilterHost)}` : ""}`}
                className={page <= 1 ? "pointer-events-none text-muted-foreground" : "text-primary hover:underline"}>
            ← Previous
          </Link>
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Link href={`/dashboard/queue?page=${Math.min(totalPages, page + 1)}${domainFilterHost ? `&domain=${encodeURIComponent(domainFilterHost)}` : ""}`}
                className={page >= totalPages ? "pointer-events-none text-muted-foreground" : "text-primary hover:underline"}>
            Next →
          </Link>
        </div>
      )}
    </div>
  );
}

function severityTone(s: string): string {
  if (s === "critical") return "text-destructive";
  if (s === "error") return "text-destructive";
  if (s === "warning") return "text-warning";
  return "text-muted-foreground";
}

function EmptyQueueState({
  domainNotFound, showSuppressed, totalDomains, unverifiedDomains, verifiedNoRuns, suppressedCount,
}: {
  domainNotFound: boolean;
  showSuppressed: boolean;
  totalDomains: number;
  unverifiedDomains: number;
  verifiedNoRuns: number;
  suppressedCount: number;
}) {
  if (domainNotFound) {
    return <p className="p-10 text-center text-sm text-muted-foreground">Domain not found or not accessible.</p>;
  }
  if (showSuppressed) {
    return <p className="p-10 text-center text-sm text-muted-foreground">No suppressed findings — nothing snoozed or dismissed.</p>;
  }
  if (totalDomains === 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-muted-foreground">No domains monitored yet.</p>
        <Link href="/dashboard" className="text-sm text-primary hover:underline">Add your first domain →</Link>
      </div>
    );
  }
  if (unverifiedDomains > 0 && unverifiedDomains === totalDomains) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-muted-foreground">
          {unverifiedDomains === 1
            ? "Your domain is pending DNS verification — audits start once ownership is proven."
            : `${unverifiedDomains} domains pending DNS verification — audits start once ownership is proven.`}
        </p>
        <Link href="/dashboard" className="text-sm text-primary hover:underline">Verify in portfolio →</Link>
      </div>
    );
  }
  if (verifiedNoRuns > 0) {
    return (
      <p className="p-10 text-center text-sm text-muted-foreground">
        Audits queued — findings will appear here within an hour of the first run.
      </p>
    );
  }
  if (suppressedCount > 0) {
    return (
      <div className="flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-sm text-muted-foreground">No open findings — everything has been snoozed or dismissed.</p>
        <Link href="/dashboard/queue?show=suppressed" className="text-sm text-primary hover:underline">Review suppressed →</Link>
      </div>
    );
  }
  return (
    <p className="p-10 text-center text-sm text-muted-foreground">
      No open findings. Your monitored sites are clean.
    </p>
  );
}
