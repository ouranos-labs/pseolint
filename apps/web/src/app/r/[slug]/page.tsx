import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import type { AuditSummary } from "@pseolint/core";
import { db } from "@/db";
import { audits, monitoredDomains } from "@/db/schema";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import { env } from "@/lib/env";
import { getOptionalSession, getOrCreateAnonSessionId } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { TileGrid } from "@/components/landing/tile-grid";
import { CopyLinkButton } from "@/components/audit/copy-link-button";
import { ExportMenu } from "@/components/report/export-menu";
import { VisibilityToggle } from "@/components/report/visibility-toggle";
import { MonitorDomainButton } from "@/components/audit/monitor-domain-button";
import { ReauditButton } from "@/components/report/reaudit-button";
import { FindingsList, CategoryBreakdown } from "@/components/audit/findings-list";
import { OriginReadinessCard } from "@/components/audit/origin-readiness-card";
import { summaryToTileStates, severityCounts, cleanPageCount } from "@/lib/audit-tiles";
import { ReportCtaStrip } from "@/components/report/cta-strip";

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
  // Reports describe third-party sites; we never want them indexed by search
  // engines or aggregated into Slack/Twitter previews with a verdict baked in.
  const robots: Metadata["robots"] = { index: false, follow: false };
  if (!row || !isReady(row)) return { title: "Audit not found · pseolint", robots };
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
  const anon = await getOrCreateAnonSessionId();
  const ownedByUser = !!(session?.user.id && row.userId === session.user.id);
  const ownedByAnon = !session && row.anonSessionId === anon;
  // Equalize "exists but private" with "doesn't exist" — a /signin redirect on
  // foreign-private slugs leaks slug existence to anons.
  if (!row.isPublic && !ownedByUser && !ownedByAnon) notFound();

  if (row.status === "queued" || row.status === "running") redirect(`/a/${row.id}`);
  if (row.status === "failed") redirect(`/a/${row.id}`);
  if (isExpired(row)) return <ExpiredState row={row} />;
  if (!isReady(row)) notFound();

  const summaryRaw = await fetchSummaryJson(summaryKey(row.id));
  const summary: AuditSummary | null = summaryRaw ? safeParse<AuditSummary>(summaryRaw) : null;

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
  const score = row.score ?? 0;
  const tone = scoreTone(score);
  const verdict = scoreVerdict(score);
  const completedAgo = relTime(row.completedAt ?? row.createdAt);

  const tileStates = summary ? summaryToTileStates(summary) : [];
  const counts = summary ? severityCounts(summary) : null;
  const cleanPages = summary ? cleanPageCount(summary) : null;

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-14">
      {ctx.kind !== "anon" && (
        <Link
          href={ctx.kind === "pro_own_monitored" ? `/dashboard/${encodeURIComponent(ctx.domainHost)}` : "/dashboard"}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <span aria-hidden>←</span>
          {ctx.kind === "pro_own_monitored" ? "Back to workspace" : "Back to dashboard"}
        </Link>
      )}
      {cached === "1" && !ownedByUser && !ownedByAnon ? (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-[18px] border border-warning/30 bg-warning/5 p-4 sm:flex-nowrap sm:items-center">
          <div className="flex-1 text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Cached audit.</span>{" "}
            Showing the most recent public audit of {hostOf(row.sourceUrl)} — not necessarily your own scan.
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
            {session ? "Run a fresh audit" : "Sign in to force fresh"}
          </Link>
        </div>
      ) : null}
      <div className="mb-6">
        <ReportCtaStrip {...ctx} />
      </div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
        Audit complete · {completedAgo}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1
          className="text-balance text-3xl tracking-tight sm:text-4xl lg:text-5xl"
          style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
        >
          {host}
        </h1>
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          ↗ {shortPath(row.sourceUrl)}
        </a>
      </div>

      <HowToRead pageCount={row.pageCount ?? 0} />

      <div className="mt-6 grid gap-6 rounded-[28px] border border-border/70 bg-card/60 p-7 backdrop-blur-sm sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)] sm:items-center sm:gap-10 sm:p-8">
        <div className="flex flex-col items-start">
          <span
            className={`leading-[0.9] tabular-nums ${tone}`}
            style={{ fontSize: "128px", fontFamily: "var(--font-display)" }}
          >
            {score}
          </span>
          <span className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Risk score · lower is safer
          </span>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border-strong bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
            <span className={`inline-block h-1 w-1 rounded-full ${toneDot(score)}`} />
            {verdict}
          </span>
        </div>

        <div className="flex flex-col gap-5">
          {tileStates.length > 0 ? (
            <TileGrid
              states={tileStates}
              title={`${host} — worst rule per page across ${tileStates.length} tiles`}
            />
          ) : (
            <div className="rounded-[18px] border border-dashed border-border/60 bg-background/40 p-4 text-xs text-muted-foreground">
              Tile map unavailable for this audit. Full report below.
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <Stat label="Pages" value={row.pageCount ?? 0} tone="text-foreground" />
            <Stat
              label="Errors"
              value={counts?.errors ?? 0}
              tone="text-destructive"
              placeholder={!counts}
            />
            <Stat
              label="Warnings"
              value={counts?.warnings ?? 0}
              tone="text-warning"
              placeholder={!counts}
            />
            <Stat
              label="Clean pages"
              value={cleanPages ?? 0}
              tone="text-success"
              placeholder={cleanPages == null}
            />
          </dl>
        </div>
      </div>

      <CoverageCallout pageCount={row.pageCount ?? 0} />

      {!session && ownedByAnon ? (
        <div className="mt-6 flex flex-wrap items-start gap-4 rounded-[22px] border border-primary/25 bg-primary/5 p-5 sm:flex-nowrap sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              This report auto-deletes in {hoursUntil(row.expiresAt)}h.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sign in (free) to keep it permanently, run more audits, and unlock private reports.
            </p>
          </div>
          <Link
            href={`/signin?callbackUrl=${encodeURIComponent(`/r/${slug}`)}`}
            className="inline-flex h-10 shrink-0 items-center rounded-[14px] bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Save this report
          </Link>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CopyLinkButton url={shareUrl} />
        <ExportMenu auditId={row.id} auditSlug={slug} isPro={ctx.kind.startsWith("pro_")} />
        {ownedByUser && (
          <VisibilityToggle auditId={row.id} initialIsPublic={row.isPublic} isPro={ctx.kind.startsWith("pro_")} />
        )}
        <Link
          href="/#top"
          className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Audit another site
        </Link>
        {session ? <MonitorDomainButton sourceUrl={row.sourceUrl} /> : null}
        {ownedByUser ? <ReauditButton sourceUrl={row.sourceUrl} /> : null}
        <Link
          href="/pricing"
          className="inline-flex h-11 items-center rounded-[18px] border border-border-strong px-5 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
        >
          Unlock PDF + 1k pages
        </Link>
        {ownedByUser || ownedByAnon ? (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {row.isPublic ? "public · shareable" : "private · owner only"}
          </span>
        ) : null}
      </div>

      {summary ? (
        <>
          <OriginReadinessCard summary={summary} />

          <section className="mt-14">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Category scores
            </h2>
            <CategoryBreakdown summary={summary} />
          </section>

          <section className="mt-14">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Findings · {summary.findings.filter((f) => f.ruleId !== "audit/origin-readiness").length}
              </h2>
              <span className="font-mono text-xs text-muted-foreground">
                sampled {summary.pageCount} page{summary.pageCount === 1 ? "" : "s"}
              </span>
            </div>
            <FindingsList summary={summary} />
          </section>
        </>
      ) : (
        <section className="mt-14 rounded-[22px] border border-dashed border-border/60 bg-card/40 p-6 text-sm text-muted-foreground">
          Structured summary unavailable for this audit. Re-audit to regenerate.
        </section>
      )}

      <section className="mt-14 rounded-[22px] border border-border/60 bg-card/40 p-6 text-xs text-muted-foreground">
        <p className="text-sm font-medium text-foreground">About this audit</p>
        <p className="mt-2 leading-relaxed">
          Report auto-deletes{" "}
          {ownedByAnon
            ? "in 24 hours"
            : ownedByUser
              ? "after 30 days"
              : "within its retention window"}
          . Retention, rate limits, and crawl behaviour are documented in full at{" "}
          <Link href="/limits" className="text-primary hover:underline">
            pseolint.dev/limits
          </Link>
          .
        </p>
      </section>
    </main>
  );
}

function HowToRead({ pageCount }: { pageCount: number }) {
  const caveats: { label: string; body: string }[] = [
    {
      label: "Sample, not census",
      body: `Scored on ${pageCount} sampled page${pageCount === 1 ? "" : "s"} from sitemap.xml. Template clusters across un-sampled pages may be missed.`,
    },
    {
      label: "Heuristic, not verdict",
      body: "35 rules inferred from public SpamBrain guidance — a structured conversation, not Google's classifier.",
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
        {caveats.map((c) => (
          <li key={c.label} className="flex gap-2.5 text-xs leading-relaxed text-muted-foreground">
            <span
              aria-hidden
              className="mt-[7px] inline-block h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60"
            />
            <span>
              <span className="block font-medium text-foreground">{c.label}</span>
              <span>{c.body}</span>
            </span>
          </li>
        ))}
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
    <div className={`mt-6 flex flex-wrap items-start gap-4 rounded-[22px] border p-5 ${tone} sm:flex-nowrap sm:items-center`}>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">
          {low ? (
            <>Only {pageCount} page{pageCount === 1 ? "" : "s"} audited — your sitemap may be incomplete.</>
          ) : (
            <>Audited {pageCount} pages from your sitemap.</>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {low ? (
            <>
              pseolint samples up to 50 pages on free audits, but uses <code className="font-mono text-foreground">sitemap.xml</code> as the source of truth. If your site has more pages, add them to the sitemap — or upgrade to Pro for 1,000-page budgets and deeper link discovery.
            </>
          ) : (
            <>
              The score above is computed on this sample. Pro lifts the budget to 1,000 pages and crawls beyond the sitemap.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  placeholder = false,
}: {
  label: string;
  value: number;
  tone: string;
  placeholder?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`font-mono text-lg tabular-nums ${placeholder ? "text-muted-foreground/50" : tone}`}>
        {placeholder ? "—" : value}
      </dd>
    </div>
  );
}

function scoreTone(score: number): string {
  if (score <= 40) return "text-success";
  if (score <= 69) return "text-warning";
  return "text-destructive";
}

function toneDot(score: number): string {
  if (score <= 40) return "bg-success";
  if (score <= 69) return "bg-warning";
  return "bg-destructive";
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
        style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 400 }}
      >
        {host}
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        This free report auto-deleted after its retention window. Anonymous reports live for 24
        hours; authenticated free reports live for 30 days. Run a fresh audit — usually 60 seconds.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/?prefill=${encodeURIComponent(row.sourceUrl)}`}
          className="inline-flex h-11 items-center rounded-[18px] bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Re-audit {host}
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
