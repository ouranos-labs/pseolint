import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits, findingsState } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import { TimelineStrip } from "@/components/dashboard/timeline-strip";
import { FindingsPanel } from "@/components/dashboard/findings-panel";

export default async function DomainWorkspace({ params }: { params: Promise<{ host: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);
  if (plan !== "pro") redirect("/pricing");

  const { host: rawHost } = await params;
  const host = decodeURIComponent(rawHost);
  const [domain] = await db.select().from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1);
  if (!domain) notFound();

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [timelineRuns, openFindings] = await Promise.all([
    db.select({
      slug: audits.slug,
      score: audits.score,
      status: audits.status,
      completedAt: audits.completedAt,
      findingCount: audits.findingCount,
    }).from(audits)
      .where(and(
        eq(audits.userId, session.user.id),
        eq(audits.sourceUrl, domain.sourceUrl),
        gte(audits.createdAt, since),
      ))
      .orderBy(desc(audits.createdAt))
      .limit(60),
    db.select().from(findingsState)
      .where(eq(findingsState.domainId, domain.id))
      .orderBy(desc(findingsState.rankScore))
      .limit(200),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader
        domain={{
          host: domain.host, sourceUrl: domain.sourceUrl,
          lastScore: domain.lastScore,
        }}
        runs={timelineRuns}
      />
      <TimelineStrip runs={timelineRuns} />
      <FindingsPanel findings={openFindings.map((f) => ({
        id: f.id,
        ruleId: f.ruleId,
        severityLatest: f.severityLatest,
        affectedPageCount: f.affectedPageCount,
        rankScore: String(f.rankScore),
        ruleMessageLatest: f.ruleMessageLatest,
        representativeUrl: f.representativeUrl,
        status: f.status,
      }))} />
    </div>
  );
}
