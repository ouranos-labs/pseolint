import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { audits, orchestratorSessions } from "@/db/schema";
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
  const [auditAgg, orchAgg] = await Promise.all([
    db
      .select({
        triageCount: sql<number>`count(${audits.triageCostUsd})::int`,
        triageSumUsd: sql<string>`coalesce(sum(${audits.triageCostUsd})::numeric(10,4), 0)`,
        auditCount: sql<number>`count(*)::int`,
      })
      .from(audits)
      .where(and(
        eq(audits.userId, session.user.id),
        gte(audits.createdAt, monthStart),
      ))
      .then((rows) => rows[0]),
    db
      .select({
        sessionCount: sql<number>`count(*)::int`,
        completedCount: sql<number>`count(*) filter (where ${orchestratorSessions.status} = 'completed')::int`,
        sumUsd: sql<string>`coalesce(sum(${orchestratorSessions.spentUsd})::numeric(10,4), 0)`,
        sumInputTokens: sql<number>`coalesce(sum(${orchestratorSessions.inputTokens}), 0)::bigint`,
        sumOutputTokens: sql<number>`coalesce(sum(${orchestratorSessions.outputTokens}), 0)::bigint`,
        sumToolCalls: sql<number>`coalesce(sum(${orchestratorSessions.toolCallCount}), 0)::int`,
      })
      .from(orchestratorSessions)
      .where(and(
        eq(orchestratorSessions.userId, session.user.id),
        gte(orchestratorSessions.startedAt, monthStart),
      ))
      .then((rows) => rows[0]),
  ]);

  const monthLabel = monthStart.toISOString().slice(0, 7);
  const totalUsd =
    Number(auditAgg?.triageSumUsd ?? 0) + Number(orchAgg?.sumUsd ?? 0);

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-xl font-medium">Usage &amp; costs</h1>
      <p className="text-sm text-muted-foreground">
        This month ({monthLabel}). Refreshes on every audit completion.
      </p>

      {(auditAgg?.auditCount ?? 0) === 0 && (orchAgg?.sessionCount ?? 0) === 0 ? (
        <div className="rounded-[18px] border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
          No audits or orchestrator sessions this month yet. Start one from <a href="/dashboard" className="text-primary hover:underline">your dashboard</a> to track usage.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[18px] border border-primary/30 bg-primary/5 p-5">
            <dl className="grid grid-cols-[1fr_auto] gap-y-3 text-sm">
              <dt className="text-sm font-medium text-foreground">Total managed-AI spend</dt>
              <dd className="font-mono text-lg font-medium tabular-nums text-foreground">${totalUsd.toFixed(2)}</dd>
            </dl>
          </div>

          <div className="rounded-[18px] border border-border/60 p-5">
            <h2 className="mb-3 text-sm font-medium text-foreground">v0.4 audits + AI triage</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-3 text-sm">
              <dt className="text-muted-foreground">Audits run</dt>
              <dd className="font-mono tabular-nums text-foreground">{auditAgg?.auditCount ?? 0}</dd>
              <dt className="text-muted-foreground">AI triage calls</dt>
              <dd className="font-mono tabular-nums text-foreground">{auditAgg?.triageCount ?? 0}</dd>
              <dt className="text-muted-foreground">AI triage spend</dt>
              <dd className="font-mono tabular-nums text-foreground">${Number(auditAgg?.triageSumUsd ?? 0).toFixed(2)}</dd>
            </dl>
          </div>

          <div className="rounded-[18px] border border-border/60 p-5">
            <h2 className="mb-3 text-sm font-medium text-foreground">AI orchestrator sessions</h2>
            <dl className="grid grid-cols-[1fr_auto] gap-y-3 text-sm">
              <dt className="text-muted-foreground">Sessions started</dt>
              <dd className="font-mono tabular-nums text-foreground">{orchAgg?.sessionCount ?? 0}</dd>
              <dt className="text-muted-foreground">Sessions completed</dt>
              <dd className="font-mono tabular-nums text-foreground">{orchAgg?.completedCount ?? 0}</dd>
              <dt className="text-muted-foreground">Tool calls</dt>
              <dd className="font-mono tabular-nums text-foreground">{orchAgg?.sumToolCalls ?? 0}</dd>
              <dt className="text-muted-foreground">Tokens (in / out)</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {formatTokens(Number(orchAgg?.sumInputTokens ?? 0))} / {formatTokens(Number(orchAgg?.sumOutputTokens ?? 0))}
              </dd>
              <dt className="text-muted-foreground">Orchestrator spend</dt>
              <dd className="font-mono tabular-nums text-foreground">${Number(orchAgg?.sumUsd ?? 0).toFixed(2)}</dd>
            </dl>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Managed-AI calls are billed by pseolint; BYO-key calls are billed directly by your provider and
        aren&apos;t reflected here beyond the run/session count.
      </p>
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
