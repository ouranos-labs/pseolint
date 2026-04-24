import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";

function startOfMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export default async function CostDashboard() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);
  if (plan !== "pro") redirect("/pricing");

  const monthStart = startOfMonth();
  const [agg] = await db
    .select({
      triageCount: sql<number>`count(${audits.triageCostUsd})::int`,
      triageSumUsd: sql<string>`coalesce(sum(${audits.triageCostUsd})::numeric(10,4), 0)`,
      auditCount: sql<number>`count(*)::int`,
    })
    .from(audits)
    .where(and(
      eq(audits.userId, session.user.id),
      gte(audits.createdAt, monthStart),
    ));

  const monthLabel = monthStart.toISOString().slice(0, 7);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-medium">Usage &amp; costs</h1>
      <p className="text-sm text-muted-foreground">
        This month ({monthLabel}). Refreshes on every audit completion.
      </p>

      <div className="rounded-[22px] border border-border/60 p-5">
        <dl className="grid grid-cols-[1fr_auto] gap-y-3 text-sm">
          <dt className="text-muted-foreground">Audits run</dt>
          <dd className="font-mono tabular-nums text-foreground">{agg?.auditCount ?? 0}</dd>
          <dt className="text-muted-foreground">AI triage calls</dt>
          <dd className="font-mono tabular-nums text-foreground">{agg?.triageCount ?? 0}</dd>
          <dt className="text-muted-foreground">AI triage spend</dt>
          <dd className="font-mono tabular-nums text-foreground">${Number(agg?.triageSumUsd ?? 0).toFixed(2)}</dd>
        </dl>
      </div>

      <p className="text-xs text-muted-foreground">
        Managed-AI calls are billed by pseolint; BYO-key calls are billed directly by your provider and
        aren&apos;t reflected here beyond the run count.
      </p>
    </div>
  );
}
