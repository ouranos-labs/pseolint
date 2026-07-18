import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { AuditSummary } from "@pseolint/core";
import { inferUrlTemplate } from "@pseolint/core";
import { db } from "@/db";
import { withDbRetry } from "@/lib/db-retry";
import { monitoredDomains, audits, findingsState, integrations, gscPageMetrics, watchedPages, indexingRequests, fixManifests, orchestratorSessions } from "@/db/schema";
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
import { gradeOf, scoreTone, verdictStyle } from "@/lib/grade";
import { detectDnsProvider } from "@/lib/dns-provider";
import { MARKETING_RULES } from "@/lib/marketing-rules";
import { WatchedPagesCard } from "./watched-pages-card";
import { QuickIndexerCard } from "@/components/dashboard/quick-indexer-card";
import { TemplateGridClient } from "@/components/dashboard/template-grid-client";
import { RootCauses } from "@/components/report/root-causes";
import { SeverityDemotions } from "@/components/report/severity-demotions";

export default async function DomainWorkspace({ params }: { params: Promise<{ host: string }> }) {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  const plan = await getPlan(session.user.id);
  if (plan !== "pro") redirect("/pricing");

  const { host: rawHost } = await params;
  const host = decodeURIComponent(rawHost);
  const [domain] = await withDbRetry(() => db.select().from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1));
  if (!domain) notFound();

  // Latest fix manifest this user generated for this domain — the funnel's
  // back-link, so "Generate fixes" results are findable later. Matched via the
  // session, which stored the exact sourceUrl the CTA sent.
  const [latestManifest] = await withDbRetry(() =>
    db
      .select({
        slug: fixManifests.slug,
        verdict: fixManifests.verdict,
        createdAt: fixManifests.createdAt,
        pagePatchCount: fixManifests.pagePatchCount,
        templatePatchCount: fixManifests.templatePatchCount,
      })
      .from(fixManifests)
      .innerJoin(orchestratorSessions, eq(fixManifests.sessionId, orchestratorSessions.id))
      .where(and(eq(orchestratorSessions.userId, session.user.id), eq(orchestratorSessions.domain, domain.sourceUrl)))
      .orderBy(desc(fixManifests.createdAt))
      .limit(1),
  );

  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [
    timelineRuns,
    openFindings,
    latestAudit,
    gscIntegration,
    gscRows,
    gscTrend,
    coverage,
    watchedRows,
    indexingIntegrations,
    recentIndexingRequests
  ] = await withDbRetry(() => Promise.all([
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
      // Cap 2000 (raised from 500 now that we're on a paid Neon plan — monthly
      // transfer is no longer the binding constraint; the original 500 was a
      // free-tier transfer guard after paperforge.dev, 2026-05-06, dumped every
      // row per render). Still bounded for dashboard render perf. Top-500 by
      // impressions already covers >95% of traffic-weighted volume; the extra
      // rows improve long-tail template attribution on very large (25k+ page) sites.
      .limit(2000),
    db.select({
      monthBucket: gscPageMetrics.monthBucket,
      impressions: sql<number>`coalesce(sum(${gscPageMetrics.impressions}), 0)::int`,
      clicks: sql<number>`coalesce(sum(${gscPageMetrics.clicks}), 0)::int`,
    }).from(gscPageMetrics)
      .where(eq(gscPageMetrics.domainId, domain.id))
      .groupBy(gscPageMetrics.monthBucket)
      .orderBy(desc(gscPageMetrics.monthBucket))
      .limit(6),
    getCumulativeCoverage({
      monitoredDomainId: domain.id,
      userId: session.user.id,
      sourceUrl: domain.sourceUrl,
    }),
    db.select({
      id: watchedPages.id,
      url: watchedPages.url,
      createdAt: watchedPages.createdAt,
      lastAuditedAt: watchedPages.lastAuditedAt,
    })
      .from(watchedPages)
      .where(eq(watchedPages.monitoredDomainId, domain.id))
      .orderBy(desc(watchedPages.createdAt)),
    db.select({ kind: integrations.kind })
      .from(integrations)
      .where(and(
        eq(integrations.userId, session.user.id),
        sql`${integrations.kind} in ('google-indexing', 'indexnow')`
      )),
    db.select({
      url: indexingRequests.url,
      provider: indexingRequests.provider,
      status: indexingRequests.status,
      error: indexingRequests.error,
      createdAt: indexingRequests.createdAt,
    })
      .from(indexingRequests)
      .where(eq(indexingRequests.domainId, domain.id))
      .orderBy(desc(indexingRequests.createdAt)),
  ]));

  const indexedUrlsRows = await withDbRetry(() => db
    .select({ url: gscPageMetrics.url })
    .from(gscPageMetrics)
    .where(and(
      eq(gscPageMetrics.domainId, domain.id),
      gte(gscPageMetrics.impressions, 1)
    )));
  const indexedUrls = indexedUrlsRows.map((r) => r.url);
  const indexedUrlSet = new Set(indexedUrls);

  // Derive clean candidate URLs: pages observed by the engine that currently
  // have zero open findings — i.e. every finding ever recorded has been
  // resolved (snoozed or dismissed). Subtract already-indexed URLs so we
  // only surface pages that genuinely need a crawl request.
  const dirtyRepresentativeUrls = openFindings
    .map((f) => f.representativeUrl)
    .filter((u): u is string => u !== null && u !== undefined);

  const allRepresentativeUrlRows = await withDbRetry(() => db
    .selectDistinct({ url: findingsState.representativeUrl })
    .from(findingsState)
    .where(and(
      eq(findingsState.domainId, domain.id),
      isNotNull(findingsState.representativeUrl)
    )));

  const cleanCandidateUrls = allRepresentativeUrlRows
    .map((r) => r.url)
    .filter((u): u is string => u !== null && u !== undefined)
    .filter((u) => !dirtyRepresentativeUrls.includes(u))
    .filter((u) => !indexedUrlSet.has(u))
    .slice(0, 100); // cap at 100 to keep the UI manageable


  let summary: AuditSummary | null = null;
  if (latestAudit?.storageKey) {
    const raw = await fetchSummaryJson(summaryKey(latestAudit.id));
    if (raw) {
      try { summary = JSON.parse(raw) as AuditSummary; } catch { summary = null; }
    }
  }

  const latestFindingsMap = new Map<
    string,
    {
      confidence?: "high" | "medium" | "low" | "speculative";
      carriedForward?: boolean;
      lastVerifiedAt?: string | null;
      effort?: "quick" | "moderate" | "structural";
    }
  >();

  if (summary) {
    const allRuleResults = [
      ...(summary.issues?.blockers ?? []),
      ...(summary.issues?.shouldFix ?? []),
      ...(summary.issues?.informational ?? []),
    ];
    for (const r of allRuleResults) {
      let sig = "__global__";
      if (r.pageUrl) {
        try {
          sig = inferUrlTemplate(r.pageUrl);
        } catch {
          sig = r.pageUrl;
        }
      }
      const key = `${r.ruleId}::${sig}`;
      latestFindingsMap.set(key, {
        confidence: r.confidence,
        carriedForward: r.carriedForward,
        lastVerifiedAt: r.lastVerifiedAt,
        effort: r.effort,
      });
    }
  }

  const tileStates = summary ? summaryToTileStates(summary) : [];
  const tileMeta = summary ? summaryToTileMeta(summary, domain.host) : [];
  const counts = summary ? severityCounts(summary) : null;
  const cleanPages = summary ? cleanPageCount(summary) : null;

  // Risk delta vs. the previous completed run, used to annotate the big number.
  const completedRuns = timelineRuns.filter((r: { status: string; risk: number | null; }) => r.status === "completed" && r.risk != null);
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
    // Capture the narrowed (non-null) value: the withDbRetry closure below would
    // otherwise widen latestAudit.completedAt back to Date | null.
    const latestCompletedAt = latestAudit.completedAt;
    const previousCompletedAt = completedRuns[1]?.completedAt ?? null;
    if (previousCompletedAt) {
      // "Recovered" must mean the engine actually RE-CHECKED the page and the
      // finding no longer fired — not merely that we didn't see it this run.
      // On monitoring runs that skip pages, a carried-forward finding's
      // lastSeenAt is frozen at its last real verification (mergeFindings skips
      // carried-forward findings), so it lands in the recovered window despite
      // never being re-verified. Counting it as "confirmed fixed" is a false
      // claim. Exclude any signature the latest summary carried forward — for
      // those we have no evidence of recovery.
      const carriedForwardKeys = new Set<string>();
      for (const [key, meta] of latestFindingsMap) {
        if (meta.carriedForward) carriedForwardKeys.add(key);
      }
      const isCarriedForward = (ruleId: string, sig: string) =>
        carriedForwardKeys.has(`${ruleId}::${sig}`);

      const [newRows, recoveredCandidates] = await withDbRetry(() => Promise.all([
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
        // Candidate recovered rows: open findings last seen in the prior-run
        // window but not in the latest run. Bounded by the per-domain findings
        // volume (already capped elsewhere); we fetch the candidates and
        // filter carried-forward signatures in JS so the count and the drawer
        // agree on the SAME honest definition.
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
            lt(findingsState.lastSeenAt, latestCompletedAt),
          ))
          .orderBy(desc(findingsState.rankScore)),
      ]));

      const recoveredConfirmed = recoveredCandidates.filter(
        (r) => !isCarriedForward(r.ruleId, r.templateSignature),
      );
      runDiff = {
        newFindings: newRows,
        recoveredCount: recoveredConfirmed.length,
        // Drawer is bounded; the strip folds the remainder into a "+N more".
        recoveredFindings: recoveredConfirmed.slice(0, 25),
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
      {/* 1. WHERE AM I — header + verify banner if blocking. */ }
      <WorkspaceHeader domain={ { host: domain.host, sourceUrl: domain.sourceUrl } } />
      { !domain.verifiedAt && (
        <VerifyBanner
          host={ domain.host }
          token={ domain.verificationToken }
          provider={ await detectDnsProvider(domain.host) }
        />
      ) }

      {/* 2. INTEGRATION HEALTH — only loud when actionable; the bound-with-data
          variant renders as a single compact pill so the happy path doesn't
          dominate the hero. */}
      <GscStatusStrip
        variant={ gscVariant }
        host={ domain.host }
        siteUrl={ domain.gscSiteUrl }
        totalImpressions={ totalImpressions }
        totalClicks={ totalClicks }
        lastSyncAt={ gscIntegration?.lastSyncAt ?? null }
        monthlyTrend={ monthlyTrend }
        topTemplates={ topTemplates }
        weightedAvgPosition={ weightedAvgPosition }
        ctr={ ctr }
      />

      {/* v0.5.3 — cumulative coverage. Reframes "200 URLs/week" as the
          running total this domain has accumulated. Hidden silently for
          brand-new domains with no completed audit history; an empty
          state here would just be noise. */}
      { coverage.urlsAuditedTotal > 0 && (
        <CumulativeCoverageCard
          urlsAuditedTotal={ coverage.urlsAuditedTotal }
          urlsAuditedLast30d={ coverage.urlsAuditedLast30d }
        />
      ) }

      {/* 3. WHERE I AM — the headline (latest risk + tile grid). */ }
      { latestAudit && summary && (
        <section className="flex flex-col gap-6">
          <div className="flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Latest audit · { latestAudit.completedAt ? new Date(latestAudit.completedAt).toLocaleString() : "—" }</span>
              { summary.truncated && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-warning"
                  title={ summary.truncatedReason ?? "The crawl was interrupted (origin degraded). Counts and risk are lower bounds." }
                >
                  <span aria-hidden>⚠</span> Partial
                </span>
              ) }
            </h2>
            <Link
              href={ `/r/${latestAudit.slug}` }
              className="text-xs text-primary hover:underline"
            >
              Open full report →
            </Link>
          </div>

          {/* v0.4 §4.11 site-classification badge — surfaces what type of site the
              engine inferred and how many pSEO-only rules were suppressed. Only
              rendered for v0.4+ reports (legacy v0.3 summaries lack the field). */}
          { summary.siteClassification && (
            <div className="-mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1">
                <span className="text-muted-foreground/70">Site type:</span>
                <span className="font-mono text-foreground">{ summary.siteClassification.type }</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{ Math.round(summary.siteClassification.confidence * 100) }% confidence</span>
              </span>
              { summary.siteClassification.suppressedRules.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1"
                  title={ summary.siteClassification.suppressedRules.join(", ") }
                >
                  <span className="tabular-nums">{ summary.siteClassification.suppressedRules.length }</span>
                  <span>pSEO-only rule{ summary.siteClassification.suppressedRules.length === 1 ? "" : "s" } suppressed</span>
                </span>
              ) }
              { summary.scrapePlan && (() => {
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
                    title={ `Reasons: ${refetchReasons || "none"} · Ruleset v${sp.rulesetVersion}` }
                  >
                    <span className="text-muted-foreground/70">Monitoring:</span>
                    <span className="tabular-nums text-foreground">{ fetchedDisplay }/{ total }</span>
                    <span>re-scraped</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{ sp.carriedForward }</span>
                    <span>carried forward</span>
                  </span>
                );
              })() }
            </div>
          ) }

          {/* Engine moderator pills — content-effort + domain authority. Both
              moderate the verdict; the public report already surfaces the
              content-effort pill, so we mirror its styling exactly here and add
              authority alongside. Each renders only when the engine resolved a
              finite score (free/unavailable runs leave them absent). */}
          { (Number.isFinite(summary.contentEffort?.score) || Number.isFinite(summary.authority?.score)) && (
            <div className="-mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              { Number.isFinite(summary.contentEffort?.score) ? (
                <div
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1 text-[11px] text-muted-foreground"
                  title="AI-judged originality & effort (0-100). Higher = more original human work; moderates the verdict."
                >
                  <span className="font-mono">Content effort</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{ Math.round(summary.contentEffort!.score) }/100</span>
                </div>
              ) : null }
              { Number.isFinite(summary.authority?.score) ? (
                <div
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1 text-[11px] text-muted-foreground"
                  title="Resolved domain authority (0-100). Moderates the verdict by ±1 tier: higher authority eases it, lower tightens it."
                >
                  <span className="font-mono">Authority</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{ Math.round(summary.authority!.score) }/100</span>
                </div>
              ) : null }
            </div>
          ) }

          {/* Which rules the site-type profile softened (renders nothing when none). */}
          <SeverityDemotions summary={ summary } />

          <div className="grid gap-6 rounded-[28px] border border-border/70 bg-card/60 p-7 backdrop-blur-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:gap-10 sm:p-8">
            <div className="flex flex-col items-start">
              {/* Headline tier = the engine's MODERATED verdict (authority +
                  content-effort shift the verdict, never the raw risk). The
                  raw risk is internal and never the headline — it stays below
                  as a secondary detail chip. */}
              { (() => {
                const v = verdictStyle(summary.verdict);
                return (
                  <span
                    className={ `inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-sm font-semibold uppercase tracking-wider ${v.border} ${v.bg} ${v.tone}` }
                    title="Engine verdict — moderated by domain authority & content-effort"
                  >
                    <span className={ `inline-block h-1.5 w-1.5 rounded-full ${v.dot}` } />
                    { v.label }
                  </span>
                );
              })() }
              <div className="mt-3 flex items-baseline gap-3">
                <span
                  className={ `font-mono text-2xl tabular-nums ${scoreTone(latestAudit.risk ?? 0)}` }
                >
                  { latestAudit.risk ?? 0 }
                </span>
                { (() => {
                  const g = gradeOf(latestAudit.risk ?? 0);
                  return (
                    <span
                      className={ `inline-flex h-7 w-7 items-center justify-center rounded-md font-mono text-sm font-bold ${g.bg} ${g.text}` }
                      title={ `Grade ${g.letter} · ${g.band}` }
                    >
                      { g.letter }
                    </span>
                  );
                })() }
                { riskDelta != null && riskDelta !== 0 && (
                  <span
                    className={ `font-mono text-sm tabular-nums ${riskDelta < 0 ? "text-success" : "text-destructive"
                      }` }
                    title={ `vs. previous run (${previousRisk})` }
                  >
                    { riskDelta > 0 ? "+" : "" }{ riskDelta }
                  </span>
                ) }
              </div>
              <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                Risk score · internal detail · lower is safer
              </span>
            </div>

            <div className="flex flex-col gap-3">
              { tileStates.length > 0 ? (
                <>
                  <TileGrid
                    states={ tileStates }
                    meta={ tileMeta }
                    title={ `${domain.host} — worst rule per page across ${tileStates.length} tiles. Click a tile to see its history.` }
                  />
                  <TileLegend
                    { ...pagesByWorstSeverity(summary) }
                    total={ tileStates.length }
                  />
                </>
              ) : (
                <div className="rounded-[18px] border border-dashed border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
                  Tile map unavailable for this audit.
                </div>
              ) }
              <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <Stat label="Pages" sub="scanned" value={ latestAudit.pageCount ?? 0 } tone="text-foreground" />
                <Stat label="Errors" sub="findings" value={ counts?.errors ?? 0 } tone="text-destructive" />
                <Stat label="Warnings" sub="findings" value={ counts?.warnings ?? 0 } tone="text-warning" />
                <Stat label="Clean" sub="pages" value={ cleanPages ?? 0 } tone="text-success" />
              </dl>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <CopyLinkButton url={ `/r/${latestAudit.slug}` } />
            <ExportMenu auditId={ latestAudit.id } auditSlug={ latestAudit.slug } isPro={ true } />
          </div>
        </section>
      ) }

      {/* 3.5 FIX THESE FIRST — AI triage root-causes. Sits right below the
          headline (verdict) and above the detailed findings work surface so the
          operator reads the prioritised plan first. Pro-only: rendered only when
          the engine populated `summary.triage`. */}
      { summary?.triage?.rootCauses?.length ? (
        <RootCauses triage={ summary.triage } generateFixes={ { domain: domain.sourceUrl } } />
      ) : null }

      { latestManifest ? (
        <Link
          href={ `/m/${latestManifest.slug}` }
          className="mt-3 inline-flex items-center gap-2 rounded-[12px] border border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>✨</span>
          Latest fix manifest · { latestManifest.verdict } ·{" "}
          { latestManifest.pagePatchCount + latestManifest.templatePatchCount } patches ·{" "}
          { new Date(latestManifest.createdAt).toLocaleDateString() }
          <span aria-hidden>→</span>
        </Link>
      ) : null }

      {/* 4. WHAT JUST CHANGED — sits below the headline so the user reads
          state-then-delta. Stronger Pro-justification per pixel than any
          other strip. */}
      { latestAudit?.completedAt && (
        <RunDiffStrip
          newFindings={ runDiff.newFindings }
          recoveredCount={ runDiff.recoveredCount }
          recoveredFindings={ runDiff.recoveredFindings }
          latestAt={ latestAudit.completedAt }
          previousAt={ runDiff.previousAt }
        />
      ) }

      {/* 5. HOW AM I TRENDING — the visual narrative of monitoring. */ }
      <RiskTrendChart runs={ timelineRuns } alertThreshold={ domain.alertThreshold } />

      {/* 6. ALERT THRESHOLD — interactive replay so the user sees what their threshold buys */ }
      <AlertThresholdSimulator
        runs={ timelineRuns }
        currentThreshold={ domain.alertThreshold }
        host={ domain.host }
      />

      {/* 6.5 WATCHED PAGES (v0.5.3) — Pro-only pinning. URLs in this list are
          force-refetched on every monitoring run regardless of diff-mode skip.
          Free users never reach this page (plan gate redirects to /pricing),
          so no upgrade CTA needed inline. */}
      <WatchedPagesCard
        monitoredDomainId={ domain.id }
        host={ domain.host }
        initialRows={ watchedRows }
      />

      {/* 6.55 INSTANT INDEXING ENGINE (v0.6) — free-form URL push for pages
          that are clean but not yet surfaced in the findings list. Respects
          the same Domain-Level Quality Gate, Hostname Guard, and Impression
          Proxy Correlation as the per-finding IndexingButton. */}
      { indexingIntegrations.length > 0 && (
        <QuickIndexerCard
          domainId={ domain.id }
          host={ domain.host }
          latestAuditRisk={ latestAudit?.risk ?? null }
          indexingIntegrations={ indexingIntegrations.map((i) => i.kind).filter((k): k is "google-indexing" | "indexnow" => k === "google-indexing" || k === "indexnow") }
          recentIndexingRequests={ recentIndexingRequests }
          indexedUrls={ indexedUrls }
          cleanCandidateUrls={ cleanCandidateUrls }
        />
      ) }

      {/* 6.6 TEMPLATE BREAKDOWN (v0.5.10) — rendered when the engine detected ≥2
          templates. Cards live above the per-URL findings list so the operator
          sees the template-level picture first, then drills down. Falls back
          silently for legacy / single-template audits. */}
      { summary && (summary.templates?.length ?? 0) >= 2 && (
        <TemplateGridClient
          templates={ summary.templates }
        />
      ) }

      {/* 7. AUDIT INTERNALS — origin readiness + category breakdown. Pulled
          *below* the trend so they don't break the state→change→trend flow. */}
      { latestAudit && summary && (
        <>
          <OriginReadinessCard summary={ summary } />
          <div>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Category scores
            </h3>
            <CategoryBreakdown summary={ summary } />
          </div>
        </>
      ) }

      {/* 8. PICK A SPECIFIC RUN — clickable bar grid for drill-down into a
          past report. Lives above the findings panel because that's where the
          user goes if they want to compare a finding to a specific historical
          state. */}
      <TimelineStrip runs={ timelineRuns } />

      {/* 9. WHAT'S WRONG — the work surface. Each row carries traffic chips,
          rank-source annotation, and (when documented) inline remediation.
          v0.6.0: when ≥2 templates are detected the per-URL list is demoted
          to a drill-down collapsed by default (template cards above are the
          primary surface). Falls through to expanded list on single-template
          / legacy audits per spec §8.4. */}
      { (summary?.templates?.length ?? 0) >= 2 ? (
        <details className="group border border-border/80 bg-card/30 rounded-[18px] transition-colors hover:border-border overflow-hidden">
          <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-4 text-sm font-medium text-foreground hover:bg-card/40">
            <span className="flex items-center gap-2">
              <span className="font-semibold">Per-URL Findings</span>
              <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">{openFindings.length} open</span>
            </span>
            <span className="font-mono text-muted-foreground transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t border-border/60 bg-card/10 p-5">
            <FindingsPanel
              findings={ openFindings.map((f) => {
                const traffic = trafficBySig.get(f.templateSignature);
                const rule = MARKETING_RULES.find((r) => r.ruleId === f.ruleId);
                const key = `${f.ruleId}::${f.templateSignature}`;
                const enriched = latestFindingsMap.get(key);
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
                  confidence: enriched?.confidence,
                  carriedForward: enriched?.carriedForward,
                  lastVerifiedAt: enriched?.lastVerifiedAt,
                  effort: enriched?.effort,
                };
              }) }
              gscBound={ gscBound }
              host={ domain.host }
              domainId={ domain.id }
              indexingIntegrations={ indexingIntegrations.map((i) => i.kind).filter((k): k is "google-indexing" | "indexnow" => k === "google-indexing" || k === "indexnow") }
              latestAuditRisk={ latestAudit?.risk ?? null }
              recentIndexingRequests={ recentIndexingRequests }
              indexedUrls={ indexedUrls }
            />
          </div>
        </details>
      ) : (
        <FindingsPanel
          findings={ openFindings.map((f) => {
            const traffic = trafficBySig.get(f.templateSignature);
            const rule = MARKETING_RULES.find((r) => r.ruleId === f.ruleId);
            const key = `${f.ruleId}::${f.templateSignature}`;
            const enriched = latestFindingsMap.get(key);
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
              confidence: enriched?.confidence,
              carriedForward: enriched?.carriedForward,
              lastVerifiedAt: enriched?.lastVerifiedAt,
              effort: enriched?.effort,
            };
          }) }
          gscBound={ gscBound }
          host={ domain.host }
          domainId={ domain.id }
          indexingIntegrations={ indexingIntegrations.map((i) => i.kind).filter((k): k is "google-indexing" | "indexnow" => k === "google-indexing" || k === "indexnow") }
          latestAuditRisk={ latestAudit?.risk ?? null }
          recentIndexingRequests={ recentIndexingRequests }
          indexedUrls={ indexedUrls }
        />
      ) }
    </div>
  );
}

function Stat({ label, sub, value, tone }: { label: string; sub?: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{ label }</dt>
      <dd className={ `mt-1 font-mono tabular-nums text-2xl ${tone}` }>{ value }</dd>
      { sub && <span className="font-mono text-[10px] text-muted-foreground/70">{ sub }</span> }
    </div>
  );
}
