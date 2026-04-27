import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { AuditSummary } from "@pseolint/core";
import { db } from "@/db";
import { monitoredDomains, audits, findingsState } from "@/db/schema";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import { TimelineStrip } from "@/components/dashboard/timeline-strip";
import { FindingsPanel } from "@/components/dashboard/findings-panel";
import { VerifyBanner } from "@/components/dashboard/verify-banner";
import { TileGrid } from "@/components/landing/tile-grid";
import { CategoryBreakdown } from "@/components/audit/findings-list";
import { OriginReadinessCard } from "@/components/audit/origin-readiness-card";
import { ExportMenu } from "@/components/report/export-menu";
import { CopyLinkButton } from "@/components/audit/copy-link-button";
import { summaryToTileStates, severityCounts, cleanPageCount } from "@/lib/audit-tiles";
import { detectDnsProvider } from "@/lib/dns-provider";

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
  const [timelineRuns, openFindings, latestAudit] = await Promise.all([
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
    // Latest completed audit — used for the rich snapshot section.
    db.select().from(audits)
      .where(and(
        eq(audits.userId, session.user.id),
        eq(audits.sourceUrl, domain.sourceUrl),
        eq(audits.status, "completed"),
      ))
      .orderBy(desc(audits.completedAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  let summary: AuditSummary | null = null;
  if (latestAudit?.storageKey) {
    const raw = await fetchSummaryJson(summaryKey(latestAudit.id));
    if (raw) {
      try { summary = JSON.parse(raw) as AuditSummary; } catch { summary = null; }
    }
  }

  const tileStates = summary ? summaryToTileStates(summary) : [];
  const counts = summary ? severityCounts(summary) : null;
  const cleanPages = summary ? cleanPageCount(summary) : null;

  // Score delta vs. the previous completed run, used to annotate the big score.
  const completedScores = timelineRuns.filter((r) => r.status === "completed" && r.score != null);
  const previousScore = completedScores[1]?.score ?? null;
  const scoreDelta =
    latestAudit?.score != null && previousScore != null ? latestAudit.score - previousScore : null;

  return (
    <div className="flex flex-col gap-6">
      <WorkspaceHeader domain={{ host: domain.host, sourceUrl: domain.sourceUrl }} />
      {!domain.verifiedAt && (
        <VerifyBanner
          host={domain.host}
          token={domain.verificationToken}
          provider={await detectDnsProvider(domain.host)}
        />
      )}

      {latestAudit && summary && (
        <section className="flex flex-col gap-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Latest audit · {latestAudit.completedAt ? new Date(latestAudit.completedAt).toLocaleString() : "—"}
            </h2>
            <Link
              href={`/r/${latestAudit.slug}`}
              className="text-xs text-primary hover:underline"
            >
              Open full report →
            </Link>
          </div>

          <div className="grid gap-6 rounded-[28px] border border-border/70 bg-card/60 p-7 backdrop-blur-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:gap-10 sm:p-8">
            <div className="flex flex-col items-start">
              <div className="flex items-baseline gap-3">
                <span
                  className={`leading-[0.9] tabular-nums ${scoreTone(latestAudit.score ?? 0)}`}
                  style={{ fontSize: "96px", fontFamily: "var(--font-display)" }}
                >
                  {latestAudit.score ?? 0}
                </span>
                {scoreDelta != null && scoreDelta !== 0 && (
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      scoreDelta < 0 ? "text-success" : "text-destructive"
                    }`}
                    title={`vs. previous run (${previousScore})`}
                  >
                    {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Risk score · lower is safer
              </span>
            </div>

            <div className="flex flex-col gap-5">
              {tileStates.length > 0 ? (
                <TileGrid
                  states={tileStates}
                  title={`${domain.host} — worst rule per page across ${tileStates.length} tiles`}
                />
              ) : (
                <div className="rounded-[18px] border border-dashed border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
                  Tile map unavailable for this audit.
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <Stat label="Pages" value={latestAudit.pageCount ?? 0} tone="text-foreground" />
                <Stat label="Errors" value={counts?.errors ?? 0} tone="text-destructive" />
                <Stat label="Warnings" value={counts?.warnings ?? 0} tone="text-warning" />
                <Stat label="Clean pages" value={cleanPages ?? 0} tone="text-success" />
              </dl>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CopyLinkButton url={`/r/${latestAudit.slug}`} />
            <ExportMenu auditId={latestAudit.id} auditSlug={latestAudit.slug} isPro={true} />
          </div>

          <OriginReadinessCard summary={summary} />

          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Category scores
            </h3>
            <CategoryBreakdown summary={summary} />
          </div>
        </section>
      )}

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

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-mono tabular-nums text-2xl ${tone}`}>{value}</dd>
    </div>
  );
}

function scoreTone(score: number): string {
  if (score < 20) return "text-success";
  if (score < 40) return "text-primary";
  if (score < 60) return "text-warning";
  return "text-destructive";
}
