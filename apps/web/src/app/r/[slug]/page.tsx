import Link from "next/link";
import type { ReactNode } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import type { AnyAuditSummary, AuditSummaryV03, AuditSummaryV04 } from "@/lib/audit-types";
import { isV04Summary } from "@/lib/audit-types";
import { FocusedLensCard } from "@/components/report/focused-lens-card";
import { getMarketingTool } from "@/lib/marketing-tools";
import { db } from "@/db";
import { audits, monitoredDomains } from "@/db/schema";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import { env } from "@/lib/env";
import { getOptionalSession, getAnonSessionId } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { TileGrid } from "@/components/landing/tile-grid";
import { CopyLinkButton } from "@/components/audit/copy-link-button";
import { ExportMenu } from "@/components/report/export-menu";
import { VisibilityToggle } from "@/components/report/visibility-toggle";
import { ReauditButton } from "@/components/report/reaudit-button";
import { FindingsList, CategoryBreakdown } from "@/components/audit/findings-list";
import { OriginReadinessCard } from "@/components/audit/origin-readiness-card";
import { summaryToTileStates, summaryToTileMeta, severityCounts, cleanPageCount, pagesByWorstSeverity } from "@/lib/audit-tiles";
import { TileLegend } from "@/components/audit/tile-legend";
import { TrackView } from "@/lib/analytics/track-view";
import { gradeOf } from "@/lib/grade";
import { ReportCtaStrip } from "@/components/report/cta-strip";
import { reportRobots, isLeaderboardEligible } from "@/lib/leaderboard";
import { BadgeEmbed } from "@/components/report/badge-embed";
import { getClaim } from "@/lib/leaderboard-claims";
import { ClaimCta } from "@/components/report/claim-cta";
import { TemplateGridClient } from "@/components/dashboard/template-grid-client";
import { RootCauses } from "@/components/report/root-causes";
import { summaryTruncation } from "@/lib/truncation";
import { SeverityDemotions } from "@/components/report/severity-demotions";

export const runtime = "nodejs";

/**
 * The one shape every secondary report action wears. The toolbar previously
 * mixed h-11/rounded-[18px]/text-sm buttons with h-9/rounded-[14px]/text-xs
 * ones in the same wrapping row; uniform metrics are what makes it read as a
 * toolbar instead of a pile.
 */
const TOOL_BTN =
  "inline-flex h-9 items-center gap-1.5 rounded-[14px] border border-border-strong bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary";

type AuditRow = typeof audits.$inferSelect;

async function findAudit(slug: string): Promise<AuditRow | null> {
  const [row] = await db.select().from(audits).where(eq(audits.slug, slug)).limit(1);
  return row ?? null;
}

function isReady(row: AuditRow): boolean {
  return row.status === "completed" && !!row.storageKey && row.expiresAt.getTime() >= Date.now();
}

function isExpired(row: AuditRow): boolean {
  return row.status === "completed" && row.expiresAt.getTime() < Date.now();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const row = await findAudit(slug);
  // Only leaderboard-eligible reports (clean + public + over the page floor)
  // are indexable; they assert a NAMED site is clean, which is defensible.
  // Every other report (private, failing, thin, not-ready) stays noindex.
  if (!row || !isReady(row)) {
    return { title: "Audit not found · pseolint", robots: { index: false, follow: false } };
  }
  const robots: Metadata["robots"] = reportRobots(row);
  const host = hostOf(row.sourceUrl);
  // Title and description are deliberately verdict-free: the score lives on
  // the page itself with hedging context. Card surfaces strip context, so we
  // don't ship "risk N/100" into screenshot-friendly OG previews.
  const title = `${host} · pseolint audit`;
  const description =
    `pseolint audit of ${host}: ${row.pageCount ?? 0} pages sampled, ${row.findingCount ?? 0} findings. ` +
    `Heuristic SpamBrain + AEO scoring; not a verdict.`;
  return {
    title,
    description,
    robots,
    openGraph: { title, description, type: "article", images: [absoluteUrl("/opengraph-image")] },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cached?: string }>;
}) {
  const { slug } = await params;
  const { cached } = await searchParams;
  const row = await findAudit(slug);
  if (!row) notFound();

  const session = await getOptionalSession();
  const anon = await getAnonSessionId(); // read-only: no cookie write during RSC render
  const ownedByUser = !!(session?.user.id && row.userId === session.user.id);
  const ownedByAnon = !session && row.anonSessionId !== null && row.anonSessionId === anon;
  // Equalize "exists but private" with "doesn't exist"; a /signin redirect on
  // foreign-private slugs leaks slug existence to anons.
  if (!row.isPublic && !ownedByUser && !ownedByAnon) notFound();

  if (row.status === "queued" || row.status === "running") redirect(`/a/${row.id}`);
  if (row.status === "failed") redirect(`/a/${row.id}`);
  if (isExpired(row)) return <ExpiredState row={ row } />;
  if (!isReady(row)) notFound();

  // Eligible = this report is permanent + publicly listed (see lib/leaderboard).
  // Drives the retention copy below: eligible reports never auto-delete.
  const eligible = isLeaderboardEligible(row);

  const claim = row.host ? await getClaim(row.host) : null;
  const claimedByViewer = !!(claim && session?.user.id && claim.userId === session.user.id);

  const summaryRaw = await fetchSummaryJson(summaryKey(row.id));
  // R2 holds a mix of v0.3 and v0.4 blobs: shape-detect at the renderer.
  // `isV04Summary` discriminates on `schemaVersion` presence, so we can fan
  // out into the appropriate hero / findings UI without risking field-access
  // crashes against the wrong shape.
  const summary: AnyAuditSummary | null = summaryRaw ? safeParse<AnyAuditSummary>(summaryRaw) : null;
  const isV04 = summary ? isV04Summary(summary) : false;
  // Tool-originated audit → render a focused-lens result for that tool's ruleLens
  // (the audit still ran the FULL rule set). null for homepage/dashboard audits.
  const reportTool = row.tool ? (getMarketingTool(row.tool) ?? null) : null;
  // Hoisted: read the truncation envelope once (the defensive R2-JSON reader is
  // pure, but calling it three times in the JSX re-walks the blob needlessly).
  const truncation = summaryTruncation(summary);

  // Viewed by the person who ran it (activation) vs. someone who followed a
  // shared link (acquisition). Same page, opposite funnel meanings.
  const reportOwned = ownedByUser || ownedByAnon;

  const domainHost = (() => { try { return new URL(row.sourceUrl).host; } catch { return null; } })();
  const originUrl = (() => {
    try { const u = new URL(row.sourceUrl); return `${u.protocol}//${u.host}`; } catch { return row.sourceUrl; }
  })();

  type CtxKind =
    | { kind: "anon"; auditSlug: string; originUrl: string }
    | { kind: "free_own"; auditSlug: string; originUrl: string }
    | { kind: "free_other"; auditSlug: string; originUrl: string }
    | { kind: "pro_own_monitored"; auditSlug: string; originUrl: string; domainHost: string }
    | { kind: "pro_own_unmonitored"; auditSlug: string; originUrl: string }
    | { kind: "pro_other"; auditSlug: string; originUrl: string };

  let ctx: CtxKind;
  if (!session) {
    ctx = { kind: "anon", auditSlug: slug, originUrl };
  } else {
    const plan = await getPlan(session.user.id);
    const isOwn = row.userId === session.user.id;
    if (plan === "free") {
      ctx = isOwn
        ? { kind: "free_own", auditSlug: slug, originUrl }
        : { kind: "free_other", auditSlug: slug, originUrl };
    } else if (!isOwn) {
      ctx = { kind: "pro_other", auditSlug: slug, originUrl };
    } else {
      const [dom] = domainHost ? await db
        .select({ host: monitoredDomains.host })
        .from(monitoredDomains)
        .where(and(
          eq(monitoredDomains.userId, session.user.id),
          eq(monitoredDomains.host, domainHost),
          isNull(monitoredDomains.removedAt),
        ))
        .limit(1) : [];
      ctx = dom
        ? { kind: "pro_own_monitored", auditSlug: slug, originUrl, domainHost: dom.host }
        : { kind: "pro_own_unmonitored", auditSlug: slug, originUrl };
    }
  }

  const shareUrl = absoluteUrl(`/r/${slug}`);
  const host = hostOf(row.sourceUrl);
  // Legacy v0.3 numeric score: only read on the legacy hero path. v0.4 reports
  // never display a numeric headline; the verdict ladder is the only public
  // signal (per Wave 3b spec: no "84/100" anywhere in the v0.4 view).
  // Sourced from the v0.3 summary blob, NOT the DB row: Agent A renamed the
  // `audits.score` column to `audits.risk`. Legacy display reads from the
  // archived JSON, which is the right place anyway (the report's own data).
  const legacyScore = summary && !isV04 ? Math.round((summary as AuditSummaryV03).score ?? 0) : 0;
  const completedAgo = relTime(row.completedAt ?? row.createdAt);

  // audit-tiles helpers were updated by Agent C to read the v0.4 issues
  // buckets. Pass v0.4 summaries directly; for v0.3 we synthesize a minimal
  // v0.4-shaped projection so tile counts still render for legacy reports.
  const tileStates = summary
    ? isV04
      ? summaryToTileStates(summary as AuditSummaryV04)
      : summaryToTileStates(legacyToV04Projection(summary as AuditSummaryV03))
    : [];
  const counts = summary
    ? isV04
      ? severityCounts(summary as AuditSummaryV04)
      : severityCounts(legacyToV04Projection(summary as AuditSummaryV03))
    : null;
  const cleanPages = summary
    ? isV04
      ? cleanPageCount(summary as AuditSummaryV04)
      : cleanPageCount(legacyToV04Projection(summary as AuditSummaryV03))
    : null;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <TrackView event={ { name: "report_viewed", props: { slug, cached: cached === "1", owned: reportOwned } } } />

      { ctx.kind !== "anon" && (
        <Link
          href={ ctx.kind === "pro_own_monitored" ? `/dashboard/${encodeURIComponent(ctx.domainHost)}` : "/dashboard" }
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <span aria-hidden>←</span>
          { ctx.kind === "pro_own_monitored" ? "Back to workspace" : "Back to dashboard" }
        </Link>
      ) }

      {/*
        Only true alerts sit above the verdict: they change how every number
        below should be read. The claim CTA, the badge embed and the CTA strip
        used to live here too, which meant up to five promotional cards before
        the one thing the reader came for. They now sit after the report.
      */}
      { truncation.truncated ? (
        <TruncatedBanner reason={ truncation.reason } kind={ truncation.kind } />
      ) : null }
      { cached === "1" && !ownedByUser && !ownedByAnon ? (
        <div className="mt-4 flex flex-col gap-3 rounded-[18px] border border-warning/30 bg-warning/5 p-4 sm:flex-row sm:items-center">
          <p className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Cached audit.</span>{ " " }
            Showing the most recent public audit of { hostOf(row.sourceUrl) }: not necessarily your own scan.
            Re-runs of the same URL within an hour are deduped to keep the crawl footprint light.
          </p>
          <Link
            href={
              session
                ? `/?prefill=${encodeURIComponent(row.sourceUrl)}&force=1`
                : `/signin?callbackUrl=${encodeURIComponent(`/?prefill=${row.sourceUrl}&force=1`)}`
            }
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-[14px] border border-border-strong px-3 text-xs font-medium transition-colors hover:bg-secondary"
          >
            { session ? "Run a fresh audit" : "Sign in to force fresh" }
          </Link>
        </div>
      ) : null }

      <header className="mt-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
          Audit complete · { completedAgo }
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1
            className="text-balance text-[clamp(1.9rem,7vw,3rem)] leading-[1.05] tracking-tight"
            style={ { fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 } }
          >
            { host }
          </h1>
          <a
            href={ row.sourceUrl }
            target="_blank"
            rel={ claim ? "noreferrer noopener" : "nofollow noreferrer noopener" }
            className="max-w-full truncate font-mono text-xs text-muted-foreground hover:text-foreground"
          >
            ↗ { shortPath(row.sourceUrl) }
          </a>
        </div>
      </header>

      { summary && !isV04 ? <LegacyFormatBanner /> : null }

      { summary && isV04 ? (
        <V04Hero
          summary={ summary as AuditSummaryV04 }
          host={ host }
          tileStates={ tileStates }
          pageCount={ row.pageCount ?? 0 }
          cleanPages={ cleanPages }
        />
      ) : (
        <LegacyHero
          score={ legacyScore }
          host={ host }
          tileStates={ tileStates }
          pageCount={ row.pageCount ?? 0 }
          counts={ counts }
          cleanPages={ cleanPages }
        />
      ) }

      {/* The caveats used to be a three-column card wedged between the title and
          the verdict. One line carries them here; the full version is in the
          collapsible at the foot of the page, still server-rendered and indexable. */}
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Heuristic score over { row.pageCount ?? 0 } sampled page{ (row.pageCount ?? 0) === 1 ? "" : "s" }, not Google&apos;s classifier.{ " " }
        <a href="#how-to-read" className="text-primary underline-offset-4 hover:underline">
          How to read this ↓
        </a>
      </p>

      {/* Category grades, promoted from a section far below the fold. They used
          to render TWICE: once as tiles inside the hero and once down there.
          The hero tiles are gone; this is the single place they live. */}
      { summary && isV04 ? (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Category grades
          </h2>
          <CategoryBreakdown summary={ summary } />
        </section>
      ) : null }

      {/* Focused-lens result: only for audits created from a /tools/[slug] entry
          point. Surfaces the tool's ruleLens prominently (delivering the tool's
          promise) + funnels to the complete report below. */}
      { summary && isV04 && reportTool ? (
        <FocusedLensCard tool={ reportTool } summary={ summary as AuditSummaryV04 } />
      ) : null }

      {/* AI triage root-causes: the "what to fix first" plan. Sits directly
          below the verdict/hero so the operator reads the prioritised summary
          before the detailed findings list. Pro-only: free/anon audits never
          populate `summary.triage`, so it renders nothing for them. */}
      { summary && isV04 && (summary as AuditSummaryV04).triage?.rootCauses?.length ? (
        <RootCauses triage={ (summary as AuditSummaryV04).triage! } />
      ) : null }

      {/* Which rules the site-type profile softened (renders nothing when none). */}
      { summary && isV04 ? (
        <SeverityDemotions summary={ summary as AuditSummaryV04 } />
      ) : null }

      <CoverageCallout pageCount={ row.pageCount ?? 0 } />

      { !session && ownedByAnon ? (
        <div
          className={ `mt-6 flex flex-col gap-4 rounded-[22px] border p-5 sm:flex-row sm:items-center ${
            eligible ? "border-success/25 bg-success/5" : "border-primary/25 bg-primary/5"
          }` }
        >
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              { eligible
                ? "This site made the public leaderboard."
                : `This report auto-deletes in ${hoursUntil(row.expiresAt)}h.` }
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              { eligible
                ? "Its report is kept permanently. Sign in (free) to run more audits and unlock private reports."
                : "Sign in (free) to keep it permanently, run more audits, and unlock private reports." }
            </p>
          </div>
          <Link
            href={ `/signin?callbackUrl=${encodeURIComponent(`/r/${slug}`)}` }
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            { eligible ? "Sign in" : "Save this report" }
          </Link>
        </div>
      ) : null }

      <div className="mt-6">
        <ReportCtaStrip { ...ctx } />
      </div>

      {/*
        Report actions. Every control is one height and one radius now: the row
        used to mix h-11/text-sm pills with h-9/text-xs ones and read as a ransom
        note once four or more were visible. The monitor / upgrade CTAs were
        dropped from here because ReportCtaStrip directly above already renders
        exactly one of them for every viewer context; the toolbar was repeating
        the same upsell a second and third time.
      */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[18px] border border-border/60 bg-card/30 p-2.5">
        <CopyLinkButton url={ shareUrl } className={ TOOL_BTN } />
        <ExportMenu auditId={ row.id } auditSlug={ slug } isPro={ ctx.kind.startsWith("pro_") } />
        {/* Visibility is a property of the SITE for a monitored domain: setting
            it per-report set one row and was undone by the next scheduled run,
            so send the owner to the one control that actually persists. A
            one-off audit has no site page, so it keeps the per-report toggle. */ }
        { ownedByUser && (
          ctx.kind === "pro_own_monitored" ? (
            <Link href={ `/dashboard/${ctx.domainHost}` } className={ TOOL_BTN }>
              <span
                aria-hidden
                className={ `inline-block h-1.5 w-1.5 rounded-full ${row.isPublic ? "bg-warning" : "bg-primary"}` }
              />
              { row.isPublic ? "Public" : "Private" } · manage for the site →
            </Link>
          ) : (
            <VisibilityToggle auditId={ row.id } initialIsPublic={ row.isPublic } isPro={ ctx.kind.startsWith("pro_") } />
          )
        ) }
        { ownedByUser ? <ReauditButton sourceUrl={ row.sourceUrl } className={ TOOL_BTN } /> : null }
        <Link
          href="/#top"
          className="inline-flex h-9 w-full items-center justify-center rounded-[14px] bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 sm:ml-auto sm:w-auto"
        >
          Audit another site
        </Link>
      </div>
      { ownedByUser || ownedByAnon ? (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          { row.isPublic ? "public · shareable" : "private · owner only" }
        </p>
      ) : null }

      { summary ? (
        <>
          <OriginReadinessCard summary={ summary } />

          {/* v0.4 grades render above, right under the verdict. Legacy v0.3
              reports have no grade tiles up there, so they keep this section. */}
          { !isV04 ? (
            <section className="mt-14">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Category scores
              </h2>
              <CategoryBreakdown summary={ summary } />
            </section>
          ) : null }

          {/* Per-template breakdown: mirrors the dashboard. Rendered when the
              engine detected ≥2 templates, placed ABOVE the per-URL findings so
              users see the template-level picture first, then drill down. Falls
              back silently for legacy / single-template audits. */}
          { isV04 && ((summary as AuditSummaryV04).templates?.length ?? 0) >= 2 ? (
            <section className="mt-14">
              {/* No heading here: TemplateGridClient renders its own
                  "Templates · N detected" header, so a wrapper <h2> printed the
                  word twice in a row. */}
              <TemplateGridClient
                templates={ (summary as AuditSummaryV04).templates }
              />
            </section>
          ) : null }

          <section id="findings" className="mt-14 scroll-mt-6">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                { isV04
                  ? `Findings · ${countV04Findings(summary as AuditSummaryV04)}`
                  : `Findings · ${(summary as AuditSummaryV03).findings.filter((f) => f.ruleId !== "audit/origin-readiness").length}` }
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                sampled { summary.pageCount } page{ summary.pageCount === 1 ? "" : "s" }
              </span>
            </div>
            <FindingsList summary={ summary } />
          </section>
        </>
      ) : (
        <section className="mt-14 rounded-[22px] border border-dashed border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
          Structured summary unavailable for this audit. Re-audit to regenerate.
        </section>
      ) }

      {/* Leaderboard / owner actions, moved below the report: they ask the
          reader to act on a result they have now actually seen. */}
      { eligible ? (
        <div className="mt-14">
          <ClaimCta host={ row.host ?? hostOf(row.sourceUrl) } claimed={ !!claim } ownedByViewer={ claimedByViewer } />
          <div className="mt-6">
            <BadgeEmbed
              host={ row.host ?? hostOf(row.sourceUrl) }
              reportUrl={ `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/r/${row.slug}` }
              badgeUrl={ `${env().BETTER_AUTH_URL.replace(/\/$/, "")}/api/badge/${encodeURIComponent(row.host ?? hostOf(row.sourceUrl))}` }
            />
          </div>
        </div>
      ) : null }

      <MethodologyNotes
        pageCount={ row.pageCount ?? 0 }
        eligible={ eligible }
        retention={ ownedByAnon ? "in 24 hours" : ownedByUser ? "after 30 days" : "within its retention window" }
      />
    </main>
  );
}

type SeverityCounts = { errors: number; warnings: number; infos: number } | null;

function LegacyFormatBanner() {
  return (
    <div className="mt-6 flex flex-wrap items-start gap-3 rounded-[18px] border border-border/60 bg-card/40 p-4 text-xs text-muted-foreground sm:flex-nowrap sm:items-center">
      <span aria-hidden className="text-base leading-none">ℹ</span>
      <p className="flex-1 leading-relaxed">
        This report uses the <span className="font-medium text-foreground">legacy v0.3 format</span>.
        The scoring model and category breakdown shown below are preserved as-written.{ " " }
        <Link href="/" className="text-primary hover:underline">
          Re-audit
        </Link>{ " " }
        for the new view.
      </p>
    </div>
  );
}

/**
 * Partial-coverage warning. Rendered above the hero when the engine flushed a
 * `truncated:true` report: either a backpressure abort (the watchdog stopped
 * the crawl on a degraded origin) or a coverage shortfall (we reached far fewer
 * URLs than the sitemap declares). The findings shown are whatever was collected,
 * so the verdict, risk, and every count are LOWER bounds: surface that loudly so
 * a partial audit isn't mistaken for a complete one. Copy branches on `kind`.
 */
function TruncatedBanner({ reason, kind }: { reason: string | null; kind: "coverage" | "backpressure" | null }) {
  const cause =
    kind === "coverage"
      ? "pseolint couldn't reach all the URLs the sitemap declares"
      : "the origin degraded under load, so pseolint stopped early to avoid overloading it";
  const advice =
    kind === "coverage"
      ? "Check for a stale sitemap or unreachable pages, then re-audit for a complete picture."
      : "Re-audit once the site is stable for a complete picture.";
  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-start gap-3 rounded-[18px] border border-warning/50 bg-warning/10 p-4 sm:flex-nowrap"
    >
      <span aria-hidden className="text-base leading-none text-warning">⚠</span>
      <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">Partial audit.</span>{ " " }
        The crawl didn&apos;t finish ({ cause }). Coverage is incomplete: treat the
        verdict, risk, and every count below as <span className="font-medium text-foreground">lower bounds</span>.{ " " }
        { advice }
        { reason ? (
          <span className="mt-1 block font-mono text-[11px] text-muted-foreground/80">
            Reason: { reason }
          </span>
        ) : null }
      </div>
    </div>
  );
}

/**
 * v0.4 hero: verdict ladder + 4 category grades. NO numeric "84/100".
 * The internal `risk` integer is intentionally never displayed; the verdict
 * tier is the only public signal so that small score drift doesn't read as a
 * regression to non-technical users.
 */
function V04Hero({
  summary,
  host,
  tileStates,
  pageCount,
  cleanPages,
}: {
  summary: AuditSummaryV04;
  host: string;
  tileStates: import("@/components/landing/tile-grid").TileState[];
  pageCount: number;
  cleanPages: number | null;
}) {
  const v = verdictTone(summary.verdict);
  // The verdict inputs (site type, confidence, discovered URLs, content effort,
  // authority) used to be four separately-positioned `mt-3` pills stacked down
  // the column, each on its own line. Same information, one wrapping row.
  const chips: { label: string; value: string; title?: string }[] = [];
  if (summary.siteClassification) {
    chips.push({ label: "Site type", value: summary.siteClassification.type });
    chips.push({
      label: "Confidence",
      value: `${clampPct(Math.round(summary.siteClassification.confidence * 100))}%`,
    });
    // `sitemap-url-count` is the total URLs DISCOVERED (sitemap scale: often
    // thousands), NOT the count actually audited (that's the Pages stat).
    const sig = summary.siteClassification.signals.find((s) => s.kind === "sitemap-url-count") as
      | { kind: "sitemap-url-count"; value: number }
      | undefined;
    if (sig) {
      chips.push({
        label: "Discovered",
        value: `${sig.value.toLocaleString("en-US")} URLs`,
        title: "Total URLs found in the sitemap. The Pages stat is how many were actually audited.",
      });
    }
  }
  // Pro-only: free/anon audits never populate contentEffort, so the finite
  // check is the gate and the chip simply doesn't appear (no upsell modal).
  if (Number.isFinite(summary.contentEffort?.score)) {
    chips.push({
      label: "Content effort",
      value: `${Math.round(summary.contentEffort!.score)}/100`,
      title: "AI-judged originality & effort (0-100). Higher = more original human work; moderates the verdict.",
    });
  }
  // Authority MODERATES the verdict (it never touches the raw `risk`): >=80
  // shifts one tier more lenient, <=30 one tier stricter, 31-79 no shift.
  if (Number.isFinite(summary.authority?.score)) {
    chips.push({
      label: "Authority",
      value: `${Math.round(summary.authority!.score)}/100`,
      title: "Domain authority (0-100). >=80 shifts the verdict one tier more lenient; <=30 one tier stricter; 31-79 no shift. Never changes the raw risk.",
    });
  }

  return (
    <section
      className={ `mt-6 overflow-hidden rounded-[28px] border ${v.border} ${v.bg} backdrop-blur-sm` }
    >
      {/* Verdict and coverage map stay side by side only from lg up. They used
          to split at sm (640px), where a 25-column tile map and a paragraph of
          headline were each squeezed into ~300px. */}
      <div className="grid gap-8 p-5 sm:p-7 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:gap-10 lg:p-8">
        <div className="flex flex-col gap-4">
          <div>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Verdict</span>
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-border-strong bg-card px-3 py-1.5">
              <span className={ `inline-block h-2 w-2 rounded-full ${v.dot}` } />
              <span
                className={ `text-2xl tabular-nums ${v.tone}` }
                style={ { fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 } }
              >
                { v.label }
              </span>
            </div>
          </div>

          <p className="max-w-prose text-sm leading-relaxed text-foreground">{ summary.headline }</p>

          { chips.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              { chips.map((c) => (
                <li key={ c.label }>
                  <span
                    title={ c.title }
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-2.5 py-1 text-[11px] text-muted-foreground"
                  >
                    <span className="font-mono">{ c.label }</span>
                    <span className="tabular-nums text-foreground">{ c.value }</span>
                  </span>
                </li>
              )) }
            </ul>
          ) : null }

          {/*
            Degeneration note: the engine emits a `degeneration-guard-tripped`
            signal when it downgraded a small-marketing/blog classification to
            `unclear` because the corpus looked degenerate (mostly thin pages or
            duplicate-heavy titles). That suppresses site-type severity
            demotions, so explain WHY the softer profile didn't apply.
          */}
          { summary.siteClassification?.signals.some((s) => s.kind === "degeneration-guard-tripped") ? (
            <p className="max-w-prose text-[11px] leading-relaxed text-muted-foreground">
              Site-type profiling was skipped: the sampled pages look degenerate
              (mostly thin or near-duplicate), so severity demotions for the
              detected site type were not applied.
            </p>
          ) : null }
        </div>

        <div className="flex flex-col gap-3">
          { tileStates.length > 0 ? (
            <>
              <TileGrid
                states={ tileStates }
                meta={ summaryToTileMeta(summary) }
                rows={ tileRows(tileStates.length) }
                title={ `${host}: worst rule per page across ${tileStates.length} tiles. Hover for page details.` }
              />
              <TileLegend
                { ...pagesByWorstSeverity(summary) }
                total={ tileStates.length }
              />
            </>
          ) : (
            <div className="rounded-[18px] border border-dashed border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
              Tile map unavailable for this audit. Full report below.
            </div>
          ) }
        </div>
      </div>

      {/* Counts on their own rail behind a divider: five numbers crammed under
          the tile map competed with the headline for the same block of space. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border/50 bg-background/20 p-5 sm:grid-cols-3 sm:p-7 lg:grid-cols-5 lg:px-8 lg:py-5">
        <Stat label="Pages" sub="scanned" value={ pageCount } tone="text-foreground" />
        <Stat label="Blockers" sub="findings" value={ summary.issues.blockers.length } tone="text-destructive" />
        <Stat label="Should fix" sub="findings" value={ summary.issues.shouldFix.length } tone="text-warning" />
        <Stat label="Info" sub="findings" value={ summary.issues.informational.length } tone="text-muted-foreground" />
        <Stat
          label="Clean"
          sub="pages"
          value={ cleanPages ?? 0 }
          tone="text-success"
          placeholder={ cleanPages == null }
        />
      </dl>
    </section>
  );
}

/**
 * Legacy v0.3 hero: preserved for posterity. Renders the original numeric
 * 84/100 + scoreVerdict label exactly as before.
 */
function LegacyHero({
  score,
  host,
  tileStates,
  pageCount,
  counts,
  cleanPages,
}: {
  score: number;
  host: string;
  tileStates: import("@/components/landing/tile-grid").TileState[];
  pageCount: number;
  counts: SeverityCounts;
  cleanPages: number | null;
}) {
  const tone = scoreTone(score);
  const verdict = scoreVerdict(score);
  return (
    <div className="mt-6 grid gap-6 rounded-[28px] border border-border/70 bg-card/60 p-7 backdrop-blur-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:gap-10 sm:p-8">
      <div className="flex flex-col items-start">
        <span
          className={ `text-[80px] leading-[0.9] tabular-nums sm:text-[104px] md:text-[128px] ${tone}` }
          style={ { fontFamily: "var(--font-display)" } }
        >
          { score }
        </span>
        <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Risk score · lower is safer
        </span>
        <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
          <span className={ `inline-block h-1 w-1 rounded-full ${toneDot(score)}` } />
          { verdict }
        </span>
      </div>

      <div className="flex flex-col gap-3">
        { tileStates.length > 0 ? (
          <>
            <TileGrid
              states={ tileStates }
              rows={ tileRows(tileStates.length) }
              title={ `${host}: worst rule per page across ${tileStates.length} tiles` }
            />
            <TileLegend
              { ...countTileStates(tileStates) }
              total={ tileStates.length }
            />
          </>
        ) : (
          <div className="rounded-[18px] border border-dashed border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
            Tile map unavailable for this audit. Full report below.
          </div>
        ) }
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <Stat label="Pages" sub="scanned" value={ pageCount } tone="text-foreground" />
          <Stat
            label="Errors"
            sub="findings"
            value={ counts?.errors ?? 0 }
            tone="text-destructive"
            placeholder={ !counts }
          />
          <Stat
            label="Warnings"
            sub="findings"
            value={ counts?.warnings ?? 0 }
            tone="text-warning"
            placeholder={ !counts }
          />
          <Stat
            label="Clean"
            sub="pages"
            value={ cleanPages ?? 0 }
            tone="text-success"
            placeholder={ cleanPages == null }
          />
        </dl>
      </div>
    </div>
  );
}

function countTileStates(states: import("@/components/landing/tile-grid").TileState[]) {
  let blockers = 0, shouldFix = 0, info = 0, clean = 0;
  for (const s of states) {
    if (s === "error") blockers++;
    else if (s === "warning") shouldFix++;
    else if (s === "info") info++;
    else if (s === "clean") clean++;
  }
  return { blockers, shouldFix, info, clean };
}

/**
 * Project a legacy v0.3 summary onto the v0.4 shape just enough for the
 * tile-grid helpers (`summaryToTileStates`, `severityCounts`, `cleanPageCount`)
 * to work. Those helpers were updated by Agent C to read v0.4's bucketed
 * `summary.issues`. Rather than fork the helpers, we lift v0.3's flat
 * `findings` array into bucket form here at the renderer boundary: keeps the
 * tile code single-shape and contains the legacy compat to one place.
 *
 * Filters out `audit/origin-readiness` for parity with the legacy renderer
 * (it's surfaced separately by OriginReadinessCard above the findings list).
 */
function legacyToV04Projection(legacy: AuditSummaryV03): AuditSummaryV04 {
  const visible = legacy.findings.filter((f) => f.ruleId !== "audit/origin-readiness");
  const blockers = visible.filter((f) => f.severity === "critical" || f.severity === "error");
  const shouldFix = visible.filter((f) => f.severity === "warning");
  const informational = visible.filter((f) => f.severity === "info");
  // The compiled AuditSummary type from `@pseolint/core` is intentionally a
  // superset of v0.3 + v0.4 during the migration window (deprecated v0.3
  // fields kept on the same interface for tooling compat). The tile helpers
  // only read `summary.issues` + `summary.pageCount`, so an `as` cast here is
  // safe; we're narrowing to the runtime contract the helpers actually use.
  return {
    schemaVersion: "2026-06-v0.6",
    verdict: "ready",
    risk: legacy.score ?? 0,
    headline: "",
    categories: {
      integrity: { grade: "A", issues: 0 },
      discoverability: { grade: "A", issues: 0 },
      citation: { grade: "A", issues: 0 },
      data: { grade: "A", issues: 0 },
      audit: { grade: "A", issues: 0 },
    },
    issues: { blockers, shouldFix, informational },
    diagnostics: {
      originReadiness: legacy.readiness ?? null,
      crawlStats: { discovered: 0, fetched: 0, skipped: 0 },
    },
    pageCount: legacy.pageCount,
    // Carry over v0.3 deprecated fields so the structurally-broader
    // transitional type compiles against the workspace dist build.
    score: legacy.score ?? 0,
    categoryScores: legacy.categoryScores,
    findings: legacy.findings,
    readiness: legacy.readiness,
    groupScores: legacy.groupScores,
    groupPageCounts: legacy.groupPageCounts,
    templateDetected: legacy.templateDetected,
    rawFindingCount: legacy.rawFindingCount,
  } as unknown as AuditSummaryV04;
}

function countV04Findings(summary: AuditSummaryV04): number {
  return (
    summary.issues.blockers.length +
    summary.issues.shouldFix.length +
    summary.issues.informational.length
  );
}

/**
 * Rows the tile map actually needs. TileGrid draws `cols * rows` rects and pads
 * the shortfall with grey "unscanned" tiles, so the fixed 8-row default turned a
 * 15-page audit into one row of data above seven rows of empty placeholders.
 */
function tileRows(count: number, cols = 25): number {
  return Math.max(1, Math.ceil(count / cols));
}

function verdictTone(verdict: AuditSummaryV04["verdict"]): {
  label: string;
  tone: string;
  dot: string;
  border: string;
  bg: string;
} {
  switch (verdict) {
    case "ready":
      return {
        label: "Ready",
        tone: "text-success",
        dot: "bg-success",
        border: "border-success/30",
        bg: "bg-success/5",
      };
    case "caution":
      return {
        label: "Caution",
        tone: "text-warning",
        dot: "bg-warning",
        border: "border-warning/30",
        bg: "bg-warning/5",
      };
    case "concerning":
      return {
        // No orange token in this design system: use a more saturated warning
        // for "concerning" and reserve destructive for "critical". The verdict
        // ladder still reads in order from the surrounding context.
        label: "Concerning",
        tone: "text-warning",
        dot: "bg-warning",
        border: "border-warning/50",
        bg: "bg-warning/10",
      };
    case "critical":
      return {
        label: "Critical",
        tone: "text-destructive",
        dot: "bg-destructive",
        border: "border-destructive/40",
        bg: "bg-destructive/5",
      };
  }
}

/**
 * Sampling caveats, coverage context and retention, folded into one collapsed
 * disclosure at the foot of the page.
 *
 * This replaces three separate always-open blocks (a three-column "How to read
 * this score" card above the hero, the non-warning half of the coverage
 * callout, and an "About this audit" card at the bottom) that between them ate
 * a screen of height to say things a reader consults once.
 *
 * Native <details>, not a client disclosure: the markup is server-rendered and
 * present in the HTML whether or not it is open, so nothing here is hidden
 * from a crawler. Only the paint is deferred, which is the point.
 */
function MethodologyNotes({
  pageCount,
  eligible,
  retention,
}: {
  pageCount: number;
  eligible: boolean;
  retention: string;
}) {
  const notes: { label: string; body: ReactNode }[] = [
    {
      label: "Sample, not census",
      body: `Scored on ${pageCount} sampled page${pageCount === 1 ? "" : "s"} from sitemap.xml. Template clusters across un-sampled pages may be missed.`,
    },
    {
      label: "Heuristic, not verdict",
      body: "Rules inferred from public SpamBrain guidance, a structured conversation, not Google's classifier.",
    },
    {
      label: "Server-rendered by default",
      body: "We read the HTML the server returns. Client-rendered content looks empty to us; Pro audits can render JS-heavy / SPA pages in a browser first.",
    },
    {
      label: "Page budget",
      body: (
        <>
          pseolint samples up to 200 pages on free audits (50 without an account) and treats{ " " }
          <code className="font-mono text-foreground">sitemap.xml</code> as the source of truth. Pro lifts the
          budget to 500 pages on manual re-audits and crawls beyond the sitemap.
        </>
      ),
    },
    {
      label: "Retention",
      body: eligible
        ? "This report is kept permanently because the site is on the public leaderboard."
        : `This report auto-deletes ${retention}.`,
    },
    {
      label: "Fair use",
      body: (
        <>
          Retention, rate limits and crawl behaviour are documented in full at{ " " }
          <Link href="/limits" className="text-primary hover:underline">
            pseolint.dev/limits
          </Link>
          .
        </>
      ),
    },
  ];

  return (
    <details className="group mt-14 rounded-[22px] border border-border/60 bg-card/30">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-[22px] p-5 outline-none transition-colors hover:bg-card/60 focus-visible:ring-2 focus-visible:ring-primary/60 [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="size-3 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-90"
        >
          <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className="text-sm font-medium text-foreground">How to read this report</h2>
        <span className="ml-auto hidden shrink-0 text-[11px] text-muted-foreground sm:block">
          sampling · scope · retention
        </span>
      </summary>
      {/* The anchor target is the BODY, not the <details>: browsers that
          support auto-expanding details open the card when a fragment inside it
          is navigated to. Older ones just scroll to the collapsed card, which
          still puts the summary under the reader's cursor. */}
      <ul id="how-to-read" className="grid scroll-mt-24 gap-4 px-5 pb-5 sm:grid-cols-2 lg:grid-cols-3">
        { notes.map((n) => (
          <li key={ n.label } className="text-xs leading-relaxed text-muted-foreground">
            <span className="block font-medium text-foreground">{ n.label }</span>
            <span>{ n.body }</span>
          </li>
        )) }
      </ul>
    </details>
  );
}

/**
 * Coverage warning. Only renders when the sample is genuinely too small to
 * trust (< 10 pages). The old "audited N pages, Pro crawls deeper" variant fired
 * on anything under 40 pages and was an upsell dressed as a warning; that copy
 * now lives in MethodologyNotes instead of taking a full card mid-page.
 */
function CoverageCallout({ pageCount }: { pageCount: number }) {
  if (pageCount >= 10) return null;
  return (
    <div className="mt-6 flex flex-col gap-2 rounded-[22px] border border-warning/40 bg-warning/5 p-5">
      <p className="text-sm font-medium text-foreground">
        Only { pageCount } page{ pageCount === 1 ? "" : "s" } audited, your sitemap may be incomplete.
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        pseolint uses <code className="font-mono text-foreground">sitemap.xml</code> as the source of truth. If your
        site has more pages, add them to the sitemap, or upgrade to Pro for 500-page manual re-audits and deeper
        link discovery.
      </p>
    </div>
  );
}
function Stat({
  label,
  sub,
  value,
  tone,
  placeholder = false,
}: {
  label: string;
  /** Tiny subtitle that disambiguates page-counts from finding-counts. */
  sub?: string;
  value: number;
  tone: string;
  placeholder?: boolean;
}) {
  return (
    <div className="flex flex-col text-nowrap">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground text-nowrap">{ label }</dt>
      <dd className={ `font-mono text-lg tabular-nums text-nowrap ${placeholder ? "text-muted-foreground/50" : tone}` }>
        { placeholder ? "—" : value }
      </dd>
      { sub && (
        <span className="font-mono text-[10px] text-muted-foreground/70">{ sub }</span>
      ) }
    </div>
  );
}

function scoreTone(score: number): string {
  return gradeOf(score).text;
}

function toneDot(score: number): string {
  return gradeOf(score).dot;
}

function scoreVerdict(score: number): string {
  if (score <= 20) return "Clean run";
  if (score <= 40) return "Low risk";
  if (score <= 69) return "Watch list";
  if (score <= 84) return "Elevated risk";
  return "Doorway garden";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function shortPath(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname === "/" ? "" : u.pathname;
    return `${u.host}${p}`;
  } catch {
    return url;
  }
}

function absoluteUrl(path: string): string {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function relTime(d: Date): string {
  const diffSec = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

function hoursUntil(d: Date): number {
  return Math.max(1, Math.round((d.getTime() - Date.now()) / 3_600_000));
}

/** Clamp a percentage from untrusted R2 JSON into the displayable [0,100]. */
function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

function ExpiredState({ row }: { row: AuditRow }) {
  const host = hostOf(row.sourceUrl);
  return (
    <main className="mx-auto max-w-xl px-5 pb-20 pt-20">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground" />
        Report expired
      </div>
      <h1
        className="mt-3 text-balance text-3xl tracking-tight sm:text-4xl"
        style={ { fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 } }
      >
        { host }
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This free report auto-deleted after its retention window. Anonymous reports live for 24
        hours; authenticated free reports live for 30 days. Run a fresh audit: usually 60 seconds.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={ `/?prefill=${encodeURIComponent(row.sourceUrl)}` }
          className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Re-audit { host }
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}

function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

// summaryTruncation (the defensive R2-JSON reader) lives in @/lib/truncation:
// pure + unit-tested there.
