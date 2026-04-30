import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { sevDot, sevBorderBg, type Severity } from "@/lib/severity-style";

const PAGE_SIZE = 25;

/**
 * Spec §5.2 "money surface": ranked open findings across every monitored
 * domain. Grounding the dashboard in actionable rows (not just charts) is the
 * primary value of Pro — operators want to know "what should I fix next" not
 * "how many findings do I have."
 */
export async function CrossDomainFixQueue({ userId }: { userId: string }) {
  const rows = await db
    .select({
      id: findingsState.id,
      ruleId: findingsState.ruleId,
      severityLatest: findingsState.severityLatest,
      affectedPageCount: findingsState.affectedPageCount,
      rankScore: findingsState.rankScore,
      ruleMessageLatest: findingsState.ruleMessageLatest,
      representativeUrl: findingsState.representativeUrl,
      lastSeenAt: findingsState.lastSeenAt,
      host: monitoredDomains.host,
    })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(
      and(
        eq(monitoredDomains.userId, userId),
        isNull(monitoredDomains.removedAt),
        eq(findingsState.status, "open"),
      ),
    )
    .orderBy(desc(findingsState.rankScore), desc(findingsState.lastSeenAt))
    .limit(PAGE_SIZE + 1);

  const visible = rows.slice(0, PAGE_SIZE);
  const hasMore = rows.length > PAGE_SIZE;

  if (visible.length === 0) {
    return (
      <section className="rounded-[18px] border border-success/30 bg-success/5 p-6 text-center">
        <h2 className="text-sm font-semibold text-success">Fix queue is empty.</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Every monitored domain is clean. Anything new will land here ranked by traffic-at-risk.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Fix queue</h2>
          <span className="font-mono text-[11px] text-muted-foreground/80">
            top {visible.length} across all monitored domains
          </span>
        </div>
      </header>

      <ol className="flex flex-col gap-2">
        {visible.map((r) => {
          const sev = r.severityLatest as Severity;
          return (
            <li key={r.id}>
              <Link
                href={`/dashboard/${encodeURIComponent(r.host)}`}
                className="group flex flex-col gap-2 rounded-[14px] border border-border/60 bg-card/40 px-4 py-3 transition-colors hover:border-border-strong hover:bg-card/70"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${sevBorderBg(sev)}`}
                  >
                    <span className={`inline-block h-1 w-1 rounded-full ${sevDot(sev)}`} />
                    {r.severityLatest}
                  </span>
                  <code className="rounded-md border border-border/60 bg-card/60 px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                    {r.ruleId}
                  </code>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {r.host}
                  </span>
                  <span className="ml-auto flex items-baseline gap-3 font-mono text-[11px] text-muted-foreground">
                    <span title="Pages affected">
                      {r.affectedPageCount} {r.affectedPageCount === 1 ? "page" : "pages"}
                    </span>
                    <span className="tabular-nums" title="Rank score">
                      rank {Number(r.rankScore).toFixed(0)}
                    </span>
                  </span>
                </div>
                <p className="text-sm text-foreground group-hover:text-foreground">{r.ruleMessageLatest}</p>
              </Link>
            </li>
          );
        })}
      </ol>

      {hasMore && (
        <p className="text-center font-mono text-[11px] text-muted-foreground">
          Showing top {PAGE_SIZE}. Open a domain to see its full queue with snooze + dismiss controls.
        </p>
      )}
    </section>
  );
}
