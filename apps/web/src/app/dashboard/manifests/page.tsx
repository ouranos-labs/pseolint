import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
// `and` reserved for future filters (status, domain): currently unused.
import { db } from "@/db";
import { fixManifests, orchestratorSessions } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";

export const runtime = "nodejs";

const STATUS_TONE: Record<string, string> = {
  completed: "text-success",
  running: "text-warning",
  queued: "text-muted-foreground",
  failed: "text-destructive",
  aborted: "text-muted-foreground",
};

const VERDICT_TONE: Record<string, string> = {
  ready: "text-success",
  caution: "text-warning",
  concerning: "text-warning",
  critical: "text-destructive",
};

export default async function ManifestsPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/signin?next=/dashboard/manifests");

  // Pull recent sessions + their manifest (left join: running/failed
  // sessions have no manifest yet but should still appear in the list so
  // users can navigate to /o/<id> for status).
  const rows = await db
    .select({
      sessionId: orchestratorSessions.id,
      domain: orchestratorSessions.domain,
      status: orchestratorSessions.status,
      reason: orchestratorSessions.reason,
      spentUsd: orchestratorSessions.spentUsd,
      toolCallCount: orchestratorSessions.toolCallCount,
      durationMs: orchestratorSessions.durationMs,
      startedAt: orchestratorSessions.startedAt,
      completedAt: orchestratorSessions.completedAt,
      manifestSlug: fixManifests.slug,
      verdict: fixManifests.verdict,
      validPatchCount: fixManifests.validPatchCount,
      totalPatchCount: fixManifests.totalPatchCount,
    })
    .from(orchestratorSessions)
    .leftJoin(fixManifests, eq(fixManifests.sessionId, orchestratorSessions.id))
    .where(eq(orchestratorSessions.userId, session.user.id))
    // Secondary sort on id for stable ordering when two sessions started in
    // the same millisecond (rare but possible when the API queues multiple
    // sessions in a tight loop).
    .orderBy(desc(orchestratorSessions.startedAt), desc(orchestratorSessions.id))
    .limit(50);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-medium text-foreground">Orchestrator manifests</h1>
        <Link
          href="/dashboard"
          className="text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>

      {rows.length === 0 ? (
        <section className="rounded-[18px] border border-dashed border-border/60 p-6 text-sm text-muted-foreground">
          No orchestrator sessions yet. Start one from{" "}
          <Link href="/dashboard" className="text-primary hover:underline">
            your dashboard
          </Link>
          .
        </section>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const link =
              row.status === "completed" && row.manifestSlug
                ? `/m/${row.manifestSlug}`
                : `/o/${row.sessionId}`;
            const dur = row.durationMs ? `${(row.durationMs / 1000).toFixed(0)}s` : "—";
            return (
              <li key={row.sessionId}>
                <Link
                  href={link}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[14px] border border-border/60 bg-card/40 px-4 py-3 transition-colors hover:bg-card/70"
                >
                  <span className="font-mono text-sm text-foreground">{row.domain}</span>
                  <span className={`text-xs uppercase tracking-wider ${STATUS_TONE[row.status] ?? ""}`}>
                    {row.status}
                  </span>
                  {row.verdict && (
                    <span className={`font-mono text-xs ${VERDICT_TONE[row.verdict] ?? ""}`}>
                      verdict: {row.verdict}
                    </span>
                  )}
                  {row.totalPatchCount !== null && row.validPatchCount !== null && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {row.validPatchCount}/{row.totalPatchCount} patches
                    </span>
                  )}
                  <span className="ml-auto flex flex-wrap gap-3 font-mono text-[11px] text-muted-foreground">
                    <span>${Number(row.spentUsd).toFixed(3)}</span>
                    <span>{row.toolCallCount} calls</span>
                    <span>{dur}</span>
                    <span>{row.startedAt.toISOString().slice(0, 10)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Sessions are listed newest-first. Up to 50 most recent. Click a row to view the manifest (or the running-progress page for in-flight sessions).
      </p>
    </div>
  );
}
