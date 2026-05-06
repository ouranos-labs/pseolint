import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { AuditSummary } from "@pseolint/core";
import { inferUrlTemplate } from "@pseolint/core";
import { db } from "@/db";
import { monitoredDomains, audits, findingsState, integrations, gscPageMetrics, watchedPages } from "@/db/schema";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { monthBucketUtc } from "@/lib/gsc";
import { getCumulativeCoverage } from "@/lib/monitoring";
import { WorkspaceHeader } from "@/components/dashboard/workspace-header";
import { CumulativeCoverageCard } from "@/components/dashboard/cumulative-coverage-card";
import { TimelineStrip } from "@/components/dashboard/timeline-strip";
import { FindingsPanel } from "@/components/dashboard/findings-panel";
import { VerifyBanner } from "@/components/dashboard/verify-banner";
import { GscStatusStrip } from "@/components/dashboard/gsc-status-strip";
import { RiskTrendChart } from "@/components/dashboard/risk-trend-chart";
import { RunDiffStrip } from "@/components/dashboard/run-diff-strip";
import { AlertThresholdSimulator } from "@/components/dashboard/alert-threshold-simulator";
import { TileGrid } from "@/components/landing/tile-grid";
import { CategoryBreakdown } from "@/components/audit/findings-list";
import { OriginReadinessCard } from "@/components/audit/origin-readiness-card";
import { ExportMenu } from "@/components/report/export-menu";
import { CopyLinkButton } from "@/components/audit/copy-link-button";
import { summaryToTileStates, summaryToTileMeta, severityCounts, cleanPageCount, pagesByWorstSeverity } from "@/lib/audit-tiles";
import { TileLegend } from "@/components/audit/tile-legend";
import { gradeOf, scoreTone } from "@/lib/grade";
import { detectDnsProvider } from "@/lib/dns-provider";
import { MARKETING_RULES } from "@/lib/marketing-rules";
import { WatchedPagesCard } from "./watched-pages-card";
import { TemplateGridClient } from "@/components/dashboard/template-grid-client";

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
  const [timelineRuns, openFindings, latestAudit, gscIntegration, gscRows, gscTrend, coverage, watchedRows] = await Promise.all([
    db.select({
      slug: audits.slug,
      risk: audits.risk,
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
    db.select({ lastSyncAt: integrations.lastSyncAt })
      .from(integrations)
      .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    // Per-domain GSC traffic for the current month bucket — TOP 500 by
    // impressions only. Aggregated below to template signature so each
    // rendered finding can show "this template gets X impressions" — the
    // visible justification for ranking by traffic. Also pulls positionAvg
    // + ctrAvg per URL so the GSC card can show a weighted average position
    // and CTR (impressions-weighted, not row-mean).
    //
    // 2026-05-06 hotfix: capped at 500 rows after a paperforge.dev render
    // exhausted the Neon free-tier monthly transfer allowance — sites with
    // 25k indexed pages were dumping every row on every dashboard render.
    // Top-500 by impressions covers >95% of total traffic-weighted volume on
    // typical sites; the impression-weighted card metrics are unchanged at
    // visible precision.
    db.select({
      url: gscPageMetrics.url,
      impressions: gscPageMetrics.impressions,
      clicks: gscPageMetrics.clicks,
      positionAvg: gscPageMetrics.positionAvg,
      ctrAvg: gscPageMetrics.ctrAvg,
    }).from(gscPageMetrics)
      .where(and(
        eq(gscPageMetrics.domainId, domain.id),
        eq(gscPageMetrics.monthBucket, monthBucketUtc()),
      ))
      .orderBy(desc(gscPageMetrics.impressions))
      .limit(500),
    // Last 6 month buckets (incl. current) aggregated for the GSC trend
    // sparkline. Group-by-bucket so we sum across URLs once at the DB.
    db.select({
      monthBucket: gscPageMetrics.monthBucket,
      impressions: sql<number>`coalesce(sum(${gscPageMetrics.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${gscPageMetrics.clicks}), 0)::int`,
    }).from(gscPageMetrics)
      .where(eq(gscPageMetrics.domainId, domain.id))
      .groupBy(gscPageMetrics.monthBucket)
      .orderBy(desc(gscPageMetrics.monthBucket))
      .limit(6),
    // v0.5.3 cumulative coverage — sum of URLs audited across this domain's
    // completed history. Cheap aggregate over the audit row, no R2 round-trip.
    getCumulativeCoverage({
      monitoredDomainId: domain.id,
      userId: session.user.id,
      sourceUrl: domain.sourceUrl,
    }),
    // v0.5.3 watched pages — pinned URLs the engine forces on every run.
    db.select({
      id: watchedPages.id,
      url: watchedPages.url,
      createdAt: watchedPages.createdAt,
      lastAuditedAt: watchedPages.lastAuditedAt,
    })
      .from(watchedPages)
      .where(eq(watchedPages.monitoredDomainId, domain.id))
      .orderBy(desc(watchedPages.createdAt)),
  ]);

  let summary: AuditSummary | null = null;
  if (latestAudit?.storageKey) {
    const raw = await fetchSummaryJson(summaryKey(latestAudit.id));
    if (raw) {
      try { summary = JSON.parse(raw) as AuditSummary; } catch { summary = null; }
    }
  }

  const tileStates = summary ? summaryToTileStates(summary) : [];
  const tileMeta = summary ? summaryToTileMeta(summary, domain.host) : [];
  const counts = summary ? severityCounts(summary) : null;
  const cleanPages = summary ? cleanPageCount(summary) : null;

  // Risk delta vs. the previous completed run, used to annotate the big number.
  const completedRuns = timelineRuns.filter((r) => r.status === "completed" && r.risk != null);
  const previousRisk = completedRuns[1]?.risk ?? null;
  const riskDelta =
    latestAudit?.risk != null && previousRisk != null ? latestAudit.risk - previousRisk : null;

  // Diff vs. the run before the latest — the "what changed" strip needs the
  // previous completed audit's timestamp to bound the new/recovered windows.
  // findingsState is cumulative (rows persist across runs); we slice it by
  // firstSeenAt / lastSeenAt against the prior run's completedAt.
  type RecoveredRow = {
    ruleId: string;
    severity: "info" | "warning" | "error" | "critical";
    templateSignature: string;
    lastSeenAt: Date;
    representativeUrl: string | null;
    affectedPageCount: number;
  };
  let runDiff: {
    newFindings: { ruleId: string; severity: "info" | "warning" | "error" | "critical"; templateSignature: string }[];
    recoveredCount: number;
    recoveredFindings: RecoveredRow[];
    previousAt: Date | null;
  } = {
    newFindings: [],
    recoveredCount: 0,
    recoveredFindings: [],
    previousAt: null,
  };
  if (latestAudit?.completedAt) {
    const previousCompletedAt = completedRuns[1]?.completedAt ?? null;
    if (previousCompletedAt) {
      const [newRows, [{ recoveredCount }], recoveredRows] = await Promise.all([
        db.select({
          ruleId: findingsState.ruleId,
          severity: findingsState.severityLatest,
          templateSignature: findingsState.templateSignature,
        })
          .from(findingsState)
          .where(and(
            eq(findingsState.domainId, domain.id),
            eq(findingsState.status, "open"),
            gte(findingsState.firstSeenAt, previousCompletedAt),
          )),
        db.select({ recoveredCount: sql<number>`count(*)::int` })
          .from(findingsState)
          .where(and(
            eq(findingsState.domainId, domain.id),
            eq(findingsState.status, "open"),
            gte(findingsState.lastSeenAt, previousCompletedAt),
            lt(findingsState.lastSeenAt, latestAudit.completedAt),
          )),
        // Recovered rows for the drawer — bounded so the page stays cheap when
        // a big chunk of issues drop off in one run. Anything beyond the cap
        // is folded into a "+N more" affordance in the strip.
        db.select({
          ruleId: findingsState.ruleId,
          severity: findingsState.severityLatest,
          templateSignature: findingsState.templateSignature,
          lastSeenAt: findingsState.lastSeenAt,
          representativeUrl: findingsState.representativeUrl,
          affectedPageCount: findingsState.affectedPageCount,
        })
          .from(findingsState)
          .where(and(
            eq(findingsState.domainId, domain.id),
            eq(findingsState.status, "open"),
            gte(findingsState.lastSeenAt, previousCompletedAt),
            lt(findingsState.lastSeenAt, latestAudit.completedAt),
          ))
          .orderBy(desc(findingsState.rankScore))
          .limit(25),
      ]);
      runDiff = {
        newFindings: newRows,
        recoveredCount,
        recoveredFindings: recoveredRows,
        previousAt: previousCompletedAt,
      };
    }
  }

  // Aggregate URL-level GSC metrics up to the same template signature used for
  // grouping findings (e.g. /blog/:slug). Findings fan out across many URLs
  // sharing one template, so impressions must too — otherwise traffic-by-page
  // wouldn't match the rank score's traffic weighting.
  const trafficBySig = new Map<string, { impressions: number; clicks: number }>();
  let totalImpressions = 0;
  let totalClicks = 0;
  // Impressions-weighted average position. A naive mean across URLs would
  // overcount low-traffic outliers — e.g. a 0-impression page at avg position
  // 80 would drag the headline number into territory that doesn't reflect
  // where the operator's actual traffic is ranking.
  let positionWeightedSum = 0;
  let positionWeightDenom = 0;
  for (const r of gscRows) {
    let sig: string;
    try { sig = inferUrlTemplate(r.url); } catch { sig = r.url; }
    const cur = trafficBySig.get(sig) ?? { impressions: 0, clicks: 0 };
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    trafficBySig.set(sig, cur);
    totalImpressions += r.impressions;
    totalClicks += r.clicks;
    if (r.positionAvg != null && r.impressions > 0) {
      positionWeightedSum += Number(r.positionAvg) * r.impressions;
      positionWeightDenom += r.impressions;
    }
  }
  const weightedAvgPosition = positionWeightDenom > 0
    ? positionWeightedSum / positionWeightDenom
    : null;
  // CTR = total clicks / total impressions; matches what GSC reports as the
  // domain-level CTR rather than the unweighted mean of per-URL ctrAvg.
  const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : null;
  // Top 3 templates by current-month impressions. The rest of the
  // distribution lives in the findings panel where each row shows its own
  // template's traffic chip.
  const topTemplates = Array.from(trafficBySig.entries())
    .map(([signature, t]) => ({ signature, impressions: t.impressions, clicks: t.clicks }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3);
  // Trend points oldest → newest so the sparkline reads left-to-right.
  // gscTrend is desc(monthBucket) limit 6, so reverse before passing through.
  const monthlyTrend = [...gscTrend]
    .reverse()
    .map((row) => ({
      monthBucket: row.monthBucket,
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
    }));

  const gscConnected = gscIntegration != null;
  const gscBound = gscConnected && Boolean(domain.gscSiteUrl);
  const gscHasData = gscBound && gscRows.length > 0;
  const gscVariant = !gscConnected
    ? "not-connected" as const
    : !domain.gscSiteUrl
    ? "connected-not-bound" as const
    : !gscHasData
    ? "bound-no-data" as const
    : "bound-with-data" as const;

  return (
    <div className="flex flex-col gap-6">
      {/* 1. WHERE AM I — header + verify banner if blocking. */}
      <WorkspaceHeader domain={{ host: domain.host, sourceUrl: domain.sourceUrl }} />
      {!domain.verifiedAt && (
        <VerifyBanner
          host={domain.host}
          token={domain.verificationToken}
          provider={await detectDnsProvider(domain.host)}
        />
      )}

      {/* 2. INTEGRATION HEALTH — only loud when actionable; the bound-with-data
          variant renders as a single compact pill so the happy path doesn't
          dominate the hero. */}
      <GscStatusStrip
        variant={gscVariant}
        host={domain.host}
        siteUrl={domain.gscSiteUrl}
        totalImpressions={totalImpressions}
        totalClicks={totalClicks}
        lastSyncAt={gscIntegration?.lastSyncAt ?? null}
        monthlyTrend={monthlyTrend}
        topTemplates={topTemplates}
        weightedAvgPosition={weightedAvgPosition}
        ctr={ctr}
      />

      {/* v0.5.3 — cumulative coverage. Reframes "200 URLs/week" as the
          running total this domain has accumulated. Hidden silently for
          brand-new domains with no completed audit history; an empty
          state here would just be noise. */}
      {coverage.urlsAuditedTotal > 0 && (
        <CumulativeCoverageCard
          urlsAuditedTotal={coverage.urlsAuditedTotal}
          urlsAuditedLast30d={coverage.urlsAuditedLast30d}
        />
      )}

      {/* 3. WHERE I AM — the headline (latest risk + tile grid). */}
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

          {/* v0.4 §4.11 site-classification badge — surfaces what type of site the
              engine inferred and how many pSEO-only rules were suppressed. Only
              rendered for v0.4+ reports (legacy v0.3 summaries lack the field). */}
          {summary.siteClassification && (
            <div className="-mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1">
                <span className="text-muted-foreground/70">Site type:</span>
                <span className="font-mono text-foreground">{summary.siteClassification.type}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{Math.round(summary.siteClassification.confidence * 100)}% confidence</span>
              </span>
              {summary.siteClassification.suppressedRules.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1"
                  title={summary.siteClassification.suppressedRules.join(", ")}
                >
                  <span className="tabular-nums">{summary.siteClassification.suppressedRules.length}</span>
                  <span>pSEO-only rule{summary.siteClassification.suppressedRules.length === 1 ? "" : "s"} suppressed</span>
                </span>
              )}
              {summary.scrapePlan && (() => {
                const sp = summary.scrapePlan;
                const total = sp.intended + sp.carriedForward;
                const refetchReasons = Object.entries(sp.reasonCounts)
                  .filter(([k]) => k !== "unchanged")
                  .sort(([, a], [, b]) => (b as number) - (a as number))
                  .map(([k, v]) => `${k}=${v}`)
                  .join(", ");
                const fetchedDisplay = sp.fetched === sp.intended
                  ? `${sp.fetched}`
                  : `${sp.fetched}/${sp.intended} (intended)`;
                return (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1"
                    title={`Reasons: ${refetchReasons || "none"} · Ruleset v${sp.rulesetVersion}`}
                  >
                    <span className="text-muted-foreground/70">Monitoring:</span>
                    <span className="tabular-nums text-foreground">{fetchedDisplay}/{total}</span>
                    <span>re-scraped</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{sp.carriedForward}</span>
                    <span>carried forward</span>
                  </span>
                );
              })()}
            </div>
          )}

          <div className="grid gap-6 rounded-[28px] border border-border/70 bg-card/60 p-7 backdrop-blur-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:gap-10 sm:p-8">
            <div className="flex flex-col items-start">
              <div className="flex items-baseline gap-3">
                <span
                  className={`text-[64px] leading-[0.9] tabular-nums sm:text-[80px] md:text-[96px] ${scoreTone(latestAudit.risk ?? 0)}`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {latestAudit.risk ?? 0}
                </span>
                {(() => {
                  const g = gradeOf(latestAudit.risk ?? 0);
                  return (
                    <span
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-md font-mono text-lg font-bold ${g.bg} ${g.text}`}
                      title={`Grade ${g.letter} · ${g.band}`}
                    >
                      {g.letter}
                    </span>
                  );
                })()}
                {riskDelta != null && riskDelta !== 0 && (
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      riskDelta < 0 ? "text-success" : "text-destructive"
                    }`}
                    title={`vs. previous run (${previousRisk})`}
                  >
                    {riskDelta > 0 ? "+" : ""}{riskDelta}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Risk score · lower is safer
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {tileStates.length > 0 ? (
                <>
                  <TileGrid
                    states={tileStates}
                    meta={tileMeta}
                    title={`${domain.host} — worst rule per page across ${tileStates.length} tiles. Click a tile to see its history.`}
                  />
                  <TileLegend
                    {...pagesByWorstSeverity(summary)}
                    total={tileStates.length}
                  />
                </>
              ) : (
                <div className="rounded-[18px] border border-dashed border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
                  Tile map unavailable for this audit.
                </div>
              )}
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Stat label="Pages" sub="scanned" value={latestAudit.pageCount ?? 0} tone="text-foreground" />
                <Stat label="Errors" sub="findings" value={counts?.errors ?? 0} tone="text-destructive" />
                <Stat label="Warnings" sub="findings" value={counts?.warnings ?? 0} tone="text-warning" />
                <Stat label="Clean" sub="pages" value={cleanPages ?? 0} tone="text-success" />
              </dl>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CopyLinkButton url={`/r/${latestAudit.slug}`} />
            <ExportMenu auditId={latestAudit.id} auditSlug={latestAudit.slug} isPro={true} />
          </div>
        </section>
      )}

      {/* 4. WHAT JUST CHANGED — sits below the headline so the user reads
          state-then-delta. Stronger Pro-justification per pixel than any
          other strip. */}
      {latestAudit?.completedAt && (
        <RunDiffStrip
          newFindings={runDiff.newFindings}
          recoveredCount={runDiff.recoveredCount}
          recoveredFindings={runDiff.recoveredFindings}
          latestAt={latestAudit.completedAt}
          previousAt={runDiff.previousAt}
        />
      )}

      {/* 5. HOW AM I TRENDING — the visual narrative of monitoring. */}
      <RiskTrendChart runs={timelineRuns} alertThreshold={domain.alertThreshold} />

      {/* 6. ALERT THRESHOLD — interactive replay so the user sees what their threshold buys */}
      <AlertThresholdSimulator
        runs={timelineRuns}
        currentThreshold={domain.alertThreshold}
        host={domain.host}
      />

      {/* 6.5 WATCHED PAGES (v0.5.3) — Pro-only pinning. URLs in this list are
          force-refetched on every monitoring run regardless of diff-mode skip.
          Free users never reach this page (plan gate redirects to /pricing),
          so no upgrade CTA needed inline. */}
      <WatchedPagesCard
        monitoredDomainId={domain.id}
        host={domain.host}
        initialRows={watchedRows}
      />

      {/* 6.6 TEMPLATE BREAKDOWN (v0.5.10) — rendered when the engine detected ≥2
          templates. Cards live above the per-URL findings list so the operator
          sees the template-level picture first, then drills down. Falls back
          silently for legacy / single-template audits. */}
      {summary && (summary.templates?.length ?? 0) >= 2 && (
        <TemplateGridClient
          templates={summary.templates}
          totalDiscoveredUrls={summary.pageCount}
        />
      )}

      {/* 7. AUDIT INTERNALS — origin readiness + category breakdown. Pulled
          *below* the trend so they don't break the state→change→trend flow. */}
      {latestAudit && summary && (
        <>
          <OriginReadinessCard summary={summary} />
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Category scores
            </h3>
            <CategoryBreakdown summary={summary} />
          </div>
        </>
      )}

      {/* 8. PICK A SPECIFIC RUN — clickable bar grid for drill-down into a
          past report. Lives above the findings panel because that's where the
          user goes if they want to compare a finding to a specific historical
          state. */}
      <TimelineStrip runs={timelineRuns} />

      {/* 9. WHAT'S WRONG — the work surface. Each row carries traffic chips,
          rank-source annotation, and (when documented) inline remediation.
          v0.6.0: when ≥2 templates are detected the per-URL list is demoted
          to a drill-down collapsed by default (template cards above are the
          primary surface). Falls through to expanded list on single-template
          / legacy audits per spec §8.4. */}
      {(summary?.templates?.length ?? 0) >= 2 ? (
        <details className="group">
          <summary className="cursor-pointer select-none list-none py-2 text-sm text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">Show all {openFindings.length} per-URL findings</span>
            <span className="hidden group-open:inline">Hide per-URL findings</span>
          </summary>
          <FindingsPanel
            findings={openFindings.map((f) => {
              const traffic = trafficBySig.get(f.templateSignature);
              const rule = MARKETING_RULES.find((r) => r.ruleId === f.ruleId);
              return {
                id: f.id,
                ruleId: f.ruleId,
                severityLatest: f.severityLatest,
                affectedPageCount: f.affectedPageCount,
                rankScore: String(f.rankScore),
                ruleMessageLatest: f.ruleMessageLatest,
                representativeUrl: f.representativeUrl,
                status: f.status,
                traffic: traffic && (traffic.impressions > 0 || traffic.clicks > 0) ? traffic : null,
                help: rule
                  ? { slug: rule.slug, oneLiner: rule.oneLiner, howToFix: rule.howToFix }
                  : null,
              };
            })}
            gscBound={gscBound}
            host={domain.host}
          />
        </details>
      ) : (
        <FindingsPanel
          findings={openFindings.map((f) => {
            const traffic = trafficBySig.get(f.templateSignature);
            const rule = MARKETING_RULES.find((r) => r.ruleId === f.ruleId);
            return {
              id: f.id,
              ruleId: f.ruleId,
              severityLatest: f.severityLatest,
              affectedPageCount: f.affectedPageCount,
              rankScore: String(f.rankScore),
              ruleMessageLatest: f.ruleMessageLatest,
              representativeUrl: f.representativeUrl,
              status: f.status,
              traffic: traffic && (traffic.impressions > 0 || traffic.clicks > 0) ? traffic : null,
              help: rule
                ? { slug: rule.slug, oneLiner: rule.oneLiner, howToFix: rule.howToFix }
                : null,
            };
          })}
          gscBound={gscBound}
          host={domain.host}
        />
      )}
    </div>
  );
}

function Stat({ label, sub, value, tone }: { label: string; sub?: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-mono tabular-nums text-2xl ${tone}`}>{value}</dd>
      {sub && <span className="font-mono text-[10px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}
