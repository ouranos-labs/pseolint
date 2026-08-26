import { Suspense } from "react";
import Link from "next/link";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { withDbRetry } from "@/lib/db-retry";
import { findingsState, fixManifests, orchestratorSessions } from "@/db/schema";
import { GscStatusStrip } from "@/components/dashboard/gsc-status-strip";
import { SiteVisibilityCard } from "@/components/dashboard/site-visibility-card";
import { CollapsibleSection } from "@/components/dashboard/collapsible-section";
import { FindingsPanel } from "@/components/dashboard/findings-panel";
import { RunDiffStrip } from "@/components/dashboard/run-diff-strip";
import { TemplateGridClient } from "@/components/dashboard/template-grid-client";
import { TileGrid } from "@/components/landing/tile-grid";
import { TileLegend } from "@/components/audit/tile-legend";
import { CategoryBreakdown } from "@/components/audit/findings-list";
import { CopyLinkButton } from "@/components/audit/copy-link-button";
import { ExportMenu } from "@/components/report/export-menu";
import { RootCauses } from "@/components/report/root-causes";
import { SeverityDemotions } from "@/components/report/severity-demotions";
import {
  summaryToTileStates,
  summaryToTileMeta,
  severityCounts,
  cleanPageCount,
  pagesByWorstSeverity,
} from "@/lib/audit-tiles";
import { gradeOf, scoreTone, verdictStyle } from "@/lib/grade";
import { MARKETING_RULES } from "@/lib/marketing-rules";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  buildFindingsMeta,
  getGscIntegration,
  getGscSnapshot,
  getIndexedUrls,
  getIndexingState,
  getLatestAudit,
  getLatestSummary,
  getOpenFindings,
  getTimelineRuns,
  getWorkspaceDomain,
  requireProSession,

} from "./_data";

export const runtime = "nodejs";

/**
 * Overview tab: what is wrong with this domain right now, and what to fix.
 *
 * Reads state → plan → change → work surface, top to bottom. Each of those is
 * its own Suspense boundary, so a slow R2 read or the traffic-weighting scan
 * can no longer keep the verdict from painting: the shell (header, tabs) comes
 * from the layout and is already on screen before any of this resolves.
 *
 * Trend, alert threshold, coverage, pinned pages and the indexing queue moved
 * to the Monitoring tab; the Search Console detail card moved to Traffic.
 */
export default async function WorkspaceOverview({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host: rawHost } = await params;
  // Both already resolved by the layout on a fresh load; cache() makes these free.
  const domain = await getWorkspaceDomain(rawHost);
  const gscIntegration = await getGscIntegration();

  // Only the ACTIONABLE Search Console states belong on overview. The happy
  // path (bound, with data) is a whole card's worth of numbers and lives on the
  // Traffic tab, so the operator isn't shown a green box they can't act on.
  const gscNudge = !gscIntegration
    ? ("not-connected" as const)
    : !domain.gscSiteUrl
      ? ("connected-not-bound" as const)
      : null;

  return (
    <div className="flex flex-col gap-6">
      {gscNudge && <GscStatusStrip variant={gscNudge} host={domain.host} siteUrl={domain.gscSiteUrl} />}

      <Suspense fallback={<HeadlineSkeleton />}>
        <HeadlineSection rawHost={rawHost} />
      </Suspense>

      {/* Fix these first: AI triage root causes, read before the detailed list. */}
      <Suspense fallback={null}>
        <PlanSection rawHost={rawHost} />
      </Suspense>

      {/* What just changed since the previous run: state, then delta. */}
      <Suspense fallback={<Skeleton className="h-24" />}>
        <RunDiffSection rawHost={rawHost} />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-64" />}>
        <FindingsSection rawHost={rawHost} />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Headline: the verdict, the risk number, the tile map
// ---------------------------------------------------------------------------

async function HeadlineSection({ rawHost }: { rawHost: string }) {
  const [domain, latestAudit, summary, runs] = await Promise.all([
    getWorkspaceDomain(rawHost),
    getLatestAudit(rawHost),
    getLatestSummary(rawHost),
    getTimelineRuns(rawHost),
  ]);

  const visibility = (
    <SiteVisibilityCard
      domainHost={domain.host}
      initialIsPublic={domain.isPublic}
      latest={latestAudit ? { risk: latestAudit.risk, pageCount: latestAudit.pageCount } : null}
    />
  );

  if (!latestAudit || !summary) {
    return (
      <div className="flex flex-col gap-6">
        {visibility}
        <p className="rounded-[18px] border border-dashed border-border/60 bg-background/40 p-5 text-sm text-muted-foreground">
          No completed audit yet. The first monitoring run lands within minutes of verification.
        </p>
      </div>
    );
  }

  const tileStates = summaryToTileStates(summary);
  const tileMeta = summaryToTileMeta(summary, domain.host);
  const counts = severityCounts(summary);
  const cleanPages = cleanPageCount(summary);

  // Risk delta vs. the previous completed run, used to annotate the big number.
  const completedRuns = runs.filter((r) => r.status === "completed" && r.risk != null);
  const previousRisk = completedRuns[1]?.risk ?? null;
  const riskDelta =
    latestAudit.risk != null && previousRisk != null ? latestAudit.risk - previousRisk : null;

  const v = verdictStyle(summary.verdict);
  const g = gradeOf(latestAudit.risk ?? 0);

  return (
    <div className="flex flex-col gap-6">
      {visibility}

      <section className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <span>
              Latest audit ·{" "}
              {latestAudit.completedAt ? formatDateTime(latestAudit.completedAt) : "—"}
            </span>
            {summary.truncated && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-warning/50 bg-warning/10 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-warning"
                title={
                  summary.truncatedReason ??
                  "The crawl was interrupted (origin degraded). Counts and risk are lower bounds."
                }
              >
                <span aria-hidden>⚠</span> Partial
              </span>
            )}
          </h2>
          <Link href={`/r/${latestAudit.slug}`} className="text-xs text-primary hover:underline">
            Open full report →
          </Link>
        </div>

        <EngineBadges summary={summary} />

        {/* Which rules the site-type profile softened (renders nothing when none). */}
        <SeverityDemotions summary={summary} />

        <div className="grid gap-6 rounded-[28px] border border-border/70 bg-card/60 p-7 backdrop-blur-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:gap-10 sm:p-8">
          <div className="flex flex-col items-start">
            {/* Headline tier = the engine's MODERATED verdict (authority +
                content-effort shift the verdict, never the raw risk). The raw
                risk is internal and never the headline; it stays below as a
                secondary detail chip. */}
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-sm font-semibold uppercase tracking-wider ${v.border} ${v.bg} ${v.tone}`}
              title="Engine verdict: moderated by domain authority & content-effort"
            >
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${v.dot}`} />
              {v.label}
            </span>
            <div className="mt-3 flex items-baseline gap-3">
              <span className={`font-mono text-2xl tabular-nums ${scoreTone(latestAudit.risk ?? 0)}`}>
                {latestAudit.risk ?? 0}
              </span>
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md font-mono text-sm font-bold ${g.bg} ${g.text}`}
                title={`Grade ${g.letter} · ${g.band}`}
              >
                {g.letter}
              </span>
              {riskDelta != null && riskDelta !== 0 && (
                <span
                  className={`font-mono text-sm tabular-nums ${riskDelta < 0 ? "text-success" : "text-destructive"}`}
                  title={`vs. previous run (${previousRisk})`}
                >
                  {riskDelta > 0 ? "+" : ""}
                  {riskDelta}
                </span>
              )}
            </div>
            <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Risk score · internal detail · lower is safer
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {tileStates.length > 0 ? (
              <>
                <TileGrid
                  states={tileStates}
                  meta={tileMeta}
                  title={`${domain.host}: worst rule per page across ${tileStates.length} tiles. Click a tile to see its history.`}
                />
                <TileLegend {...pagesByWorstSeverity(summary)} total={tileStates.length} />
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
    </div>
  );
}

/**
 * v0.4 §4.11 site-classification badge plus the engine's verdict moderators.
 * All render only when the engine populated them: legacy v0.3 summaries and
 * free runs leave them absent.
 */
function EngineBadges({ summary }: { summary: NonNullable<Awaited<ReturnType<typeof getLatestSummary>>> }) {
  const cls = summary.siteClassification;
  const sp = summary.scrapePlan;
  const hasModerators =
    Number.isFinite(summary.contentEffort?.score) || Number.isFinite(summary.authority?.score);
  if (!cls && !hasModerators) return null;

  return (
    <div className="-mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      {cls && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1">
          <span className="text-muted-foreground/70">Site type:</span>
          <span className="font-mono text-foreground">{cls.type}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{Math.round(cls.confidence * 100)}% confidence</span>
        </span>
      )}
      {cls && cls.suppressedRules.length > 0 && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1"
          title={cls.suppressedRules.join(", ")}
        >
          <span className="tabular-nums">{cls.suppressedRules.length}</span>
          <span>pSEO-only rule{cls.suppressedRules.length === 1 ? "" : "s"} suppressed</span>
        </span>
      )}
      {cls && sp && (() => {
        const total = sp.intended + sp.carriedForward;
        const refetchReasons = Object.entries(sp.reasonCounts)
          .filter(([k]) => k !== "unchanged")
          .sort(([, a], [, b]) => (b as number) - (a as number))
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        const fetchedDisplay =
          sp.fetched === sp.intended ? `${sp.fetched}` : `${sp.fetched}/${sp.intended} (intended)`;
        return (
          <span
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1"
            title={`Reasons: ${refetchReasons || "none"} · Ruleset v${sp.rulesetVersion}`}
          >
            <span className="text-muted-foreground/70">Monitoring:</span>
            <span className="tabular-nums text-foreground">
              {fetchedDisplay}/{total}
            </span>
            <span>re-scraped</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{sp.carriedForward}</span>
            <span>carried forward</span>
          </span>
        );
      })()}
      {Number.isFinite(summary.contentEffort?.score) && (
        <span
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1"
          title="AI-judged originality & effort (0-100). Higher = more original human work; moderates the verdict."
        >
          <span className="font-mono">Content effort</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{Math.round(summary.contentEffort!.score)}/100</span>
        </span>
      )}
      {Number.isFinite(summary.authority?.score) && (
        <span
          className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1"
          title="Resolved domain authority (0-100). Moderates the verdict by ±1 tier: higher authority eases it, lower tightens it."
        >
          <span className="font-mono">Authority</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{Math.round(summary.authority!.score)}/100</span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan: AI triage root causes + the latest generated fix manifest
// ---------------------------------------------------------------------------

async function PlanSection({ rawHost }: { rawHost: string }) {
  const session = await requireProSession();
  const [domain, summary] = await Promise.all([
    getWorkspaceDomain(rawHost),
    getLatestSummary(rawHost),
  ]);

  // The funnel's back-link, so "Generate fixes" results stay findable. Matched
  // via the orchestrator session, which stored the exact sourceUrl the CTA sent.
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
      .where(
        and(
          eq(orchestratorSessions.userId, session.user.id),
          eq(orchestratorSessions.domain, domain.sourceUrl),
        ),
      )
      .orderBy(desc(fixManifests.createdAt))
      .limit(1),
  );

  if (!summary?.triage?.rootCauses?.length && !latestManifest) return null;

  return (
    <>
      {summary?.triage?.rootCauses?.length ? (
        <RootCauses triage={summary.triage} generateFixes={{ domain: domain.sourceUrl }} />
      ) : null}
      {latestManifest ? (
        <Link
          href={`/m/${latestManifest.slug}`}
          className="inline-flex items-center gap-2 self-start rounded-[12px] border border-border/60 bg-card/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>✨</span>
          Latest fix manifest · {latestManifest.verdict} ·{" "}
          {latestManifest.pagePatchCount + latestManifest.templatePatchCount} patches ·{" "}
          {formatDate(latestManifest.createdAt)}
          <span aria-hidden>→</span>
        </Link>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// What just changed since the previous run
// ---------------------------------------------------------------------------

async function RunDiffSection({ rawHost }: { rawHost: string }) {
  const [domain, latestAudit, summary, runs] = await Promise.all([
    getWorkspaceDomain(rawHost),
    getLatestAudit(rawHost),
    getLatestSummary(rawHost),
    getTimelineRuns(rawHost),
  ]);
  if (!latestAudit?.completedAt) return null;

  const latestCompletedAt = latestAudit.completedAt;
  const completedRuns = runs.filter((r) => r.status === "completed" && r.risk != null);
  const previousCompletedAt = completedRuns[1]?.completedAt ?? null;

  if (!previousCompletedAt) {
    return (
      <RunDiffStrip
        newFindings={[]}
        recoveredCount={0}
        recoveredFindings={[]}
        latestAt={latestCompletedAt}
        previousAt={null}
      />
    );
  }

  // "Recovered" must mean the engine actually RE-CHECKED the page and the
  // finding no longer fired: not merely that we didn't see it this run. On
  // monitoring runs that skip pages, a carried-forward finding's lastSeenAt is
  // frozen at its last real verification (mergeFindings skips carried-forward
  // findings), so it lands in the recovered window despite never being
  // re-verified. Counting it as "confirmed fixed" would be a false claim, so we
  // exclude any signature the latest summary carried forward.
  const carriedForward = new Set(
    Array.from(buildFindingsMeta(summary))
      .filter(([, meta]) => meta.carriedForward)
      .map(([key]) => key),
  );

  const [newRows, recoveredCandidates] = await withDbRetry(() =>
    Promise.all([
      db
        .select({
          ruleId: findingsState.ruleId,
          severity: findingsState.severityLatest,
          templateSignature: findingsState.templateSignature,
        })
        .from(findingsState)
        .where(
          and(
            eq(findingsState.domainId, domain.id),
            eq(findingsState.status, "open"),
            gte(findingsState.firstSeenAt, previousCompletedAt),
          ),
        ),
      // Candidate recovered rows: open findings last seen in the prior-run
      // window but not in the latest run. We fetch candidates and filter
      // carried-forward signatures in JS so the count and the drawer agree on
      // the SAME honest definition.
      db
        .select({
          ruleId: findingsState.ruleId,
          severity: findingsState.severityLatest,
          templateSignature: findingsState.templateSignature,
          lastSeenAt: findingsState.lastSeenAt,
          representativeUrl: findingsState.representativeUrl,
          affectedPageCount: findingsState.affectedPageCount,
        })
        .from(findingsState)
        .where(
          and(
            eq(findingsState.domainId, domain.id),
            eq(findingsState.status, "open"),
            gte(findingsState.lastSeenAt, previousCompletedAt),
            lt(findingsState.lastSeenAt, latestCompletedAt),
          ),
        )
        .orderBy(desc(findingsState.rankScore)),
    ]),
  );

  const recovered = recoveredCandidates.filter(
    (r) => !carriedForward.has(`${r.ruleId}::${r.templateSignature}`),
  );

  return (
    <RunDiffStrip
      newFindings={newRows}
      recoveredCount={recovered.length}
      // Drawer is bounded; the strip folds the remainder into a "+N more".
      recoveredFindings={recovered.slice(0, 25)}
      latestAt={latestCompletedAt}
      previousAt={previousCompletedAt}
    />
  );
}

// ---------------------------------------------------------------------------
// The work surface: templates, findings, category scores
// ---------------------------------------------------------------------------

async function FindingsSection({ rawHost }: { rawHost: string }) {
  const [domain, summary, openFindings, gsc, indexing, latestAudit, indexedUrls] = await Promise.all([
    getWorkspaceDomain(rawHost),
    getLatestSummary(rawHost),
    getOpenFindings(rawHost),
    getGscSnapshot(rawHost),
    getIndexingState(rawHost),
    getLatestAudit(rawHost),
    getIndexedUrls(rawHost),
  ]);

  const meta = buildFindingsMeta(summary);
  const findings = openFindings.map((f) => {
    const traffic = gsc.trafficBySignature.get(f.templateSignature);
    const rule = MARKETING_RULES.find((r) => r.ruleId === f.ruleId);
    const enriched = meta.get(`${f.ruleId}::${f.templateSignature}`);
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
      help: rule ? { slug: rule.slug, oneLiner: rule.oneLiner, howToFix: rule.howToFix } : null,
      confidence: enriched?.confidence,
      carriedForward: enriched?.carriedForward,
      lastVerifiedAt: enriched?.lastVerifiedAt,
      effort: enriched?.effort,
    };
  });

  const panel = (
    <FindingsPanel
      findings={findings}
      gscBound={gsc.variant === "bound-with-data" || gsc.variant === "bound-no-data"}
      host={domain.host}
      domainId={domain.id}
      indexingIntegrations={indexing.providers}
      latestAuditRisk={latestAudit?.risk ?? null}
      recentIndexingRequests={indexing.recentRequests}
      indexedUrls={indexedUrls}
    />
  );

  const multiTemplate = (summary?.templates?.length ?? 0) >= 2;

  return (
    <div className="flex flex-col gap-6">
      {/* v0.5.10: template cards above the per-URL list so the operator sees the
          template-level picture first, then drills down. */}
      {multiTemplate && <TemplateGridClient templates={summary!.templates} />}

      {/* v0.6.0 §8.4: with ≥2 templates the per-URL list is a drill-down
          collapsed by default; single-template and legacy audits keep the
          expanded list. */}
      {multiTemplate ? (
        <details className="group overflow-hidden rounded-[18px] border border-border/80 bg-card/30 transition-colors hover:border-border">
          <summary className="flex cursor-pointer select-none items-center justify-between px-5 py-4 text-sm font-medium text-foreground hover:bg-card/40">
            <span className="flex items-center gap-2">
              <span className="font-semibold">Per-URL findings</span>
              <span className="rounded-full bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {openFindings.length} open
              </span>
            </span>
            <span className="font-mono text-muted-foreground transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t border-border/60 bg-card/10 p-5">{panel}</div>
        </details>
      ) : (
        panel
      )}

      {summary && (
        <CollapsibleSection
          title="Category scores"
          description="Per-category grades behind the composite risk score."
          defaultOpen={false}
        >
          <CategoryBreakdown summary={summary} />
        </CollapsibleSection>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Stat({ label, sub, value, tone }: { label: string; sub?: string; value: number; tone: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-1 font-mono text-2xl tabular-nums ${tone}`}>{value}</dd>
      {sub && <span className="font-mono text-[10px] text-muted-foreground/70">{sub}</span>}
    </div>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[18px] bg-muted/25 ${className}`} aria-hidden />;
}

function HeadlineSkeleton() {
  return (
    <div className="grid animate-pulse gap-6 rounded-[28px] border border-border/70 bg-card/40 p-7 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:gap-10 sm:p-8" aria-hidden>
      <div className="flex flex-col items-start gap-3">
        <div className="h-8 w-32 rounded-full bg-muted/50" />
        <div className="h-8 w-24 rounded-lg bg-muted/50" />
        <div className="h-3 w-28 rounded bg-muted/40" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-md bg-muted/40" />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
