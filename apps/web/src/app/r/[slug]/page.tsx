import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import type { AnyAuditSummary, AuditSummaryV03, AuditSummaryV04 } from "@/lib/audit-types";
import { isV04Summary } from "@/lib/audit-types";
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
import { MonitorDomainButton } from "@/components/audit/monitor-domain-button";
import { ReauditButton } from "@/components/report/reaudit-button";
import { FindingsList, CategoryBreakdown } from "@/components/audit/findings-list";
import { OriginReadinessCard } from "@/components/audit/origin-readiness-card";
import { summaryToTileStates, summaryToTileMeta, severityCounts, cleanPageCount, pagesByWorstSeverity } from "@/lib/audit-tiles";
import { TileLegend } from "@/components/audit/tile-legend";
import { gradeOf } from "@/lib/grade";
import { ReportCtaStrip } from "@/components/report/cta-strip";
import { reportRobots, isLeaderboardEligible } from "@/lib/leaderboard";
import { getClaim } from "@/lib/leaderboard-claims";
import { ClaimCta } from "@/components/report/claim-cta";

export const runtime = "nodejs";

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
  // are indexable — they assert a NAMED site is clean, which is defensible.
  // Every other report (private, failing, thin, not-ready) stays noindex.
  if (!row || !isReady(row)) {
    return { title: "Audit not found · pseolint", robots: { index: false, follow: false } };
  }
  const robots: Metadata["robots"] = reportRobots(row);
  const host = hostOf(row.sourceUrl);
  // Title and description are deliberately verdict-free — the score lives on
  // the page itself with hedging context. Card surfaces strip context, so we
  // don't ship "risk N/100" into screenshot-friendly OG previews.
  const title = `${host} · pseolint audit`;
  const description =
    `pseolint audit of ${host} — ${row.pageCount ?? 0} pages sampled, ${row.findingCount ?? 0} findings. ` +
    `Heuristic SpamBrain + AEO scoring; not a verdict.`;
  return {
    title,
    description,
    robots,
    openGraph: { title, description, type: "article" },
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
  const anon = await getAnonSessionId(); // read-only — no cookie write during RSC render
  const ownedByUser = !!(session?.user.id && row.userId === session.user.id);
  const ownedByAnon = !session && row.anonSessionId !== null && row.anonSessionId === anon;
  // Equalize "exists but private" with "doesn't exist" — a /signin redirect on
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
  // R2 holds a mix of v0.3 and v0.4 blobs — shape-detect at the renderer.
  // `isV04Summary` discriminates on `schemaVersion` presence, so we can fan
  // out into the appropriate hero / findings UI without risking field-access
  // crashes against the wrong shape.
  const summary: AnyAuditSummary | null = summaryRaw ? safeParse<AnyAuditSummary>(summaryRaw) : null;
  const isV04 = summary ? isV04Summary(summary) : false;

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
  // Legacy v0.3 numeric score — only read on the legacy hero path. v0.4 reports
  // never display a numeric headline; the verdict ladder is the only public
  // signal (per Wave 3b spec — no "84/100" anywhere in the v0.4 view).
  // Sourced from the v0.3 summary blob, NOT the DB row — Agent A renamed the
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
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      { ctx.kind !== "anon" && (
        <Link
          href={ ctx.kind === "pro_own_monitored" ? `/dashboard/${encodeURIComponent(ctx.domainHost)}` : "/dashboard" }
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span>
          { ctx.kind === "pro_own_monitored" ? "Back to workspace" : "Back to dashboard" }
        </Link>
      ) }
      { cached === "1" && !ownedByUser && !ownedByAnon ? (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-[18px] border border-warning/30 bg-warning/5 p-4 sm:flex-nowrap sm:items-center">
          <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Cached audit.</span>{ " " }
            Showing the most recent public audit of { hostOf(row.sourceUrl) } — not necessarily your own scan.
            Re-runs of the same URL within an hour are deduped to keep the crawl footprint light.
          </div>
          <Link
            href={
              session
                ? `/?prefill=${encodeURIComponent(row.sourceUrl)}&force=1`
                : `/signin?callbackUrl=${encodeURIComponent(`/?prefill=${row.sourceUrl}&force=1`)}`
            }
            className="inline-flex h-9 shrink-0 items-center rounded-[14px] border border-border-strong px-3 text-xs font-medium hover:bg-secondary"
          >
            { session ? "Run a fresh audit" : "Sign in to force fresh" }
          </Link>
        </div>
      ) : null }
      <div className="mb-6">
        <ReportCtaStrip { ...ctx } />
      </div>
      { eligible ? (
        <ClaimCta host={ row.host ?? hostOf(row.sourceUrl) } claimed={ !!claim } ownedByViewer={ claimedByViewer } />
      ) : null }
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        Audit complete · { completedAgo }
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1
          className="text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={ { fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 } }
        >
          { host }
        </h1>
        <a
          href={ row.sourceUrl }
          target="_blank"
          rel={ claim ? "noreferrer noopener" : "nofollow noreferrer noopener" }
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          ↗ { shortPath(row.sourceUrl) }
        </a>
      </div>

      <HowToRead pageCount={ row.pageCount ?? 0 } />

      { summary && !isV04 ? <LegacyFormatBanner /> : null }

      { summary && isV04 ? (
        <V04Hero
          summary={ summary as AuditSummaryV04 }
          host={ host }
          tileStates={ tileStates }
          pageCount={ row.pageCount ?? 0 }
          counts={ counts }
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

      <CoverageCallout pageCount={ row.pageCount ?? 0 } />

      { !session && ownedByAnon ? (
        eligible ? (
          <div className="mt-6 flex flex-wrap items-start gap-4 rounded-[22px] border border-success/25 bg-success/5 p-5 sm:flex-nowrap sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                This site made the public leaderboard.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Its report is kept permanently. Sign in (free) to run more audits and unlock private reports.
              </p>
            </div>
            <Link
              href={ `/signin?callbackUrl=${encodeURIComponent(`/r/${slug}`)}` }
              className="inline-flex h-10 shrink-0 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-start gap-4 rounded-[22px] border border-primary/25 bg-primary/5 p-5 sm:flex-nowrap sm:items-center">
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                This report auto-deletes in { hoursUntil(row.expiresAt) }h.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Sign in (free) to keep it permanently, run more audits, and unlock private reports.
              </p>
            </div>
            <Link
              href={ `/signin?callbackUrl=${encodeURIComponent(`/r/${slug}`)}` }
              className="inline-flex h-10 shrink-0 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Save this report
            </Link>
          </div>
        )
      ) : null }

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CopyLinkButton url={ shareUrl } />
        <ExportMenu auditId={ row.id } auditSlug={ slug } isPro={ ctx.kind.startsWith("pro_") } />
        { ownedByUser && (
          <VisibilityToggle auditId={ row.id } initialIsPublic={ row.isPublic } isPro={ ctx.kind.startsWith("pro_") } />
        ) }
        <Link
          href="/#top"
          className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Audit another site
        </Link>
        { session ? (
          <MonitorDomainButton
            sourceUrl={ row.sourceUrl }
            isPro={ ctx.kind.startsWith("pro_") }
            auditSlug={ slug }
          />
        ) : null }
        { ownedByUser ? <ReauditButton sourceUrl={ row.sourceUrl } /> : null }
        { !ctx.kind.startsWith("pro_") && (
          <Link
            href={ `/pricing?intent=monitor&audit=${encodeURIComponent(slug)}` }
            className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            Upgrade to Pro · monitor + PDF →
          </Link>
        ) }
        { ownedByUser || ownedByAnon ? (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            { row.isPublic ? "public · shareable" : "private · owner only" }
          </span>
        ) : null }
      </div>

      { summary ? (
        <>
          <OriginReadinessCard summary={ summary } />

          <section className="mt-14">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              { isV04 ? "Category grades" : "Category scores" }
            </h2>
            <CategoryBreakdown summary={ summary } />
          </section>

          <section className="mt-14">
            <div className="mb-4 flex items-baseline justify-between">
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

      <section className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-xs text-muted-foreground">
        <p className="text-sm font-medium text-foreground">About this audit</p>
        <p className="mt-2 leading-relaxed">
          { eligible
            ? "This report is kept permanently because the site is on the public leaderboard."
            : (
              <>
                Report auto-deletes{ " " }
                { ownedByAnon ? "in 24 hours" : ownedByUser ? "after 30 days" : "within its retention window" }
                .
              </>
            ) } Retention, rate limits, and crawl behaviour are documented in full at{ " " }
          <Link href="/limits" className="text-primary hover:underline">
            pseolint.dev/limits
          </Link>
          .
        </p>
      </section>
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
 * v0.4 hero — verdict ladder + 4 category grades. NO numeric "84/100".
 * The internal `risk` integer is intentionally never displayed; the verdict
 * tier is the only public signal so that small score drift doesn't read as a
 * regression to non-technical users.
 */
function V04Hero({
  summary,
  host,
  tileStates,
  pageCount,
  counts,
  cleanPages,
}: {
  summary: AuditSummaryV04;
  host: string;
  tileStates: import("@/components/landing/tile-grid").TileState[];
  pageCount: number;
  counts: SeverityCounts;
  cleanPages: number | null;
}) {
  const v = verdictTone(summary.verdict);
  return (
    <div
      className={ `mt-6 grid gap-6 rounded-[28px] border ${v.border} ${v.bg} p-7 backdrop-blur-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-stretch sm:gap-10 sm:p-8` }
    >
      <div className="flex flex-col items-start justify-between gap-5">
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
          <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground">{ summary.headline }</p>
          {/*
            v0.4 §4.11 site-classification badge — sits between the verdict
            pill and the four category-grade tiles. Only rendered when the
            engine populated `siteClassification` (v0.4+ reports). Legacy
            v0.3 reports flow through LegacyHero and never reach this branch.
          */}
          { summary.siteClassification ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1 text-[11px] text-muted-foreground">
              <span className="font-mono">Site type: { summary.siteClassification.type }</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{ Math.round(summary.siteClassification.confidence * 100) }% confidence</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                { (() => {
                  const sig = summary.siteClassification.signals.find((s) => s.kind === "sitemap-url-count") as
                    | { kind: "sitemap-url-count"; value: number }
                    | undefined;
                  return `${(sig?.value ?? 0).toLocaleString("en-US")} URLs audited`;
                })() }
              </span>
            </div>
          ) : null }
        </div>

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          { (
            [
              { key: "integrity", label: "Integrity" },
              { key: "discoverability", label: "Discoverability" },
              { key: "citation", label: "Citation" },
              { key: "data", label: "Data" },
            ] as const
          ).map(({ key, label }) => {
            const cat = summary.categories[key];
            if (!cat) return null;
            const g = gradeTone(cat.grade);
            return (
              <div
                key={ key }
                className={ `rounded-[14px] border ${g.border} ${g.bg} p-3 text-center` }
                title={ `${label}: ${cat.issues} ${cat.issues === 1 ? "issue" : "issues"}` }
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{ label }</div>
                <div
                  className={ `mt-1 leading-none tabular-nums ${g.tone}` }
                  style={ { fontFamily: "var(--font-display)", fontSize: "40px" } }
                >
                  { cat.grade }
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  { cat.issues } { cat.issues === 1 ? "issue" : "issues" }
                </div>
              </div>
            );
          }) }
        </div>
      </div>

      <div className="flex flex-col gap-3">
        { tileStates.length > 0 ? (
          <>
            <TileGrid
              states={ tileStates }
              meta={ summaryToTileMeta(summary) }
              title={ `${host} — worst rule per page across ${tileStates.length} tiles. Hover for page details.` }
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
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-5">
          <Stat label="Pages" sub="scanned" value={ pageCount } tone="text-foreground" />
          <Stat
            label="Blockers"
            sub="findings"
            value={ summary.issues.blockers.length }
            tone="text-destructive"
          />
          <Stat
            label="Should fix"
            sub="findings"
            value={ summary.issues.shouldFix.length }
            tone="text-warning"
          />
          <Stat
            label="Info"
            sub="findings"
            value={ summary.issues.informational.length }
            tone="text-muted-foreground"
          />
          <Stat
            label="Clean"
            sub="pages"
            value={ cleanPages ?? 0 }
            tone="text-success"
            placeholder={ cleanPages == null }
          />
        </dl>
        {/* Counts kept for symmetry but not surfaced — v0.4 prefers the bucket counts above. */ }
        <span className="hidden">{ counts ? counts.errors : 0 }</span>
      </div>
    </div>
  );
}

/**
 * Legacy v0.3 hero — preserved for posterity. Renders the original numeric
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
              title={ `${host} — worst rule per page across ${tileStates.length} tiles` }
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
 * `findings` array into bucket form here at the renderer boundary — keeps the
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
  // safe — we're narrowing to the runtime contract the helpers actually use.
  return {
    schemaVersion: "2026-04-v0.4",
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
        // No orange token in this design system — use a more saturated warning
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

function gradeTone(grade: string): { tone: string; border: string; bg: string } {
  if (grade === "A" || grade === "B") {
    return { tone: "text-success", border: "border-success/30", bg: "bg-success/5" };
  }
  if (grade === "C") {
    return { tone: "text-warning", border: "border-warning/30", bg: "bg-warning/5" };
  }
  if (grade === "D") {
    return { tone: "text-warning", border: "border-warning/50", bg: "bg-warning/10" };
  }
  // F + anything else
  return { tone: "text-destructive", border: "border-destructive/40", bg: "bg-destructive/5" };
}

function HowToRead({ pageCount }: { pageCount: number }) {
  const caveats: { label: string; body: string }[] = [
    {
      label: "Sample, not census",
      body: `Scored on ${pageCount} sampled page${pageCount === 1 ? "" : "s"} from sitemap.xml. Template clusters across un-sampled pages may be missed.`,
    },
    {
      label: "Heuristic, not verdict",
      body: "Rules inferred from public SpamBrain guidance — a structured conversation, not Google's classifier.",
    },
    {
      label: "Server-rendered only",
      body: "We read the HTML the server returns. Client-rendered content looks empty to us (Pro has browser rendering).",
    },
  ];

  return (
    <section
      aria-label="How to read this score"
      className="mt-6 rounded-[22px] border border-border/60 bg-card/30 p-5 backdrop-blur-sm"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          How to read this score
        </h2>
        <Link
          href="/limits"
          className="font-mono text-[11px] text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
        >
          full fair-use & limits ↗
        </Link>
      </div>
      <ul className="grid gap-3 sm:grid-cols-3">
        { caveats.map((c) => (
          <li key={ c.label } className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <span
              aria-hidden
              className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60"
            />
            <span>
              <span className="block font-medium text-foreground">{ c.label }</span>
              <span>{ c.body }</span>
            </span>
          </li>
        )) }
      </ul>
    </section>
  );
}

function CoverageCallout({ pageCount }: { pageCount: number }) {
  if (pageCount >= 40) return null;
  const low = pageCount < 10;
  const tone = low
    ? "border-warning/40 bg-warning/5 text-warning"
    : "border-border/60 bg-card/40 text-muted-foreground";
  return (
    <div className={ `mt-6 flex flex-wrap items-start gap-4 rounded-[22px] border p-5 ${tone} sm:flex-nowrap sm:items-center` }>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">
          { low ? (
            <>Only { pageCount } page{ pageCount === 1 ? "" : "s" } audited — your sitemap may be incomplete.</>
          ) : (
            <>Audited { pageCount } pages from your sitemap.</>
          ) }
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          { low ? (
            <>
              pseolint samples up to 200 pages on free audits (50 without an account), but uses <code className="font-mono text-foreground">sitemap.xml</code> as the source of truth. If your site has more pages, add them to the sitemap — or upgrade to Pro for 500-page manual re-audits and deeper link discovery.
            </>
          ) : (
            <>
              The score above is computed on this sample. Pro lifts the budget to 500 pages on manual re-audits and crawls beyond the sitemap.
            </>
          ) }
        </p>
      </div>
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
        hours; authenticated free reports live for 30 days. Run a fresh audit — usually 60 seconds.
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
