import Link from "next/link";
import { db } from "@/db";
import { audits, findingsState, monitoredDomains, integrations } from "@/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { fetchOgMeta } from "@/lib/og-fetch";

type DomainRow = typeof monitoredDomains.$inferSelect;

interface PortfolioStripProps {
  domains: DomainRow[];
  userId: string;
}

type TrendPoint = { risk: number; t: number };
type OgFields = { title: string | null; description: string | null; image: string | null };

/** Cap how many missing-OG audits we backfill per render so a slow homepage
 *  can't extend the dashboard render past a few seconds. Rest are picked up
 *  on subsequent revalidations / navigations. */
const OG_BACKFILL_PER_RENDER = 8;

export async function PortfolioStrip({ domains, userId }: PortfolioStripProps) {
  const domainIds = domains.map((d) => d.id);
  const sourceUrls = domains.map((d) => d.sourceUrl);
  const lastAuditIds = domains.map((d) => d.lastAuditId).filter((id): id is string => id != null);
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [counts, gscIntegration, runs, ogRows] = await Promise.all([
    domainIds.length > 0
      ? db
          .select({
            domainId: findingsState.domainId,
            openCount: sql<number>`count(${findingsState.id}) filter (where ${findingsState.status} = 'open')::int`.as("open_count"),
          })
          .from(findingsState)
          .where(inArray(findingsState.domainId, domainIds))
          .groupBy(findingsState.domainId)
      : Promise.resolve([] as { domainId: string; openCount: number }[]),
    db
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.userId, userId), eq(integrations.kind, "gsc")))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    sourceUrls.length > 0
      ? db
          .select({
            sourceUrl: audits.sourceUrl,
            risk: audits.risk,
            completedAt: audits.completedAt,
          })
          .from(audits)
          .where(and(
            eq(audits.userId, userId),
            eq(audits.status, "completed"),
            inArray(audits.sourceUrl, sourceUrls),
            gte(audits.createdAt, since),
          ))
      : Promise.resolve([] as { sourceUrl: string; risk: number | null; completedAt: Date | null }[]),
    lastAuditIds.length > 0
      ? db
          .select({
            id: audits.id,
            ogTitle: audits.ogTitle,
            ogDescription: audits.ogDescription,
            ogImageUrl: audits.ogImageUrl,
          })
          .from(audits)
          .where(inArray(audits.id, lastAuditIds))
      : Promise.resolve([] as { id: string; ogTitle: string | null; ogDescription: string | null; ogImageUrl: string | null }[]),
  ]);

  const countMap = new Map(counts.map((c) => [c.domainId, c.openCount]));
  const gscGrantExists = Boolean(gscIntegration);

  const trendsBySource = new Map<string, TrendPoint[]>();
  for (const r of runs) {
    if (r.risk == null || r.completedAt == null) continue;
    const arr = trendsBySource.get(r.sourceUrl) ?? [];
    arr.push({ risk: r.risk, t: r.completedAt.getTime() });
    trendsBySource.set(r.sourceUrl, arr);
  }
  for (const arr of trendsBySource.values()) arr.sort((a, b) => a.t - b.t);

  const ogByAuditId = new Map(ogRows.map((r) => [r.id, r]));

  // Lazy backfill: same pattern as the leaderboard. Bounded fetches per render
  // so a slow audited homepage can't stretch dashboard latency.
  const missing = domains
    .filter((d) => {
      if (!d.lastAuditId) return false;
      const og = ogByAuditId.get(d.lastAuditId);
      return og ? !og.ogImageUrl && !og.ogTitle && !og.ogDescription : false;
    })
    .slice(0, OG_BACKFILL_PER_RENDER);
  const freshOgByAuditId = new Map<string, OgFields>();
  if (missing.length > 0) {
    const results = await Promise.allSettled(
      missing.map(async (d) => {
        const og = await fetchOgMeta(d.sourceUrl);
        return { auditId: d.lastAuditId!, og };
      }),
    );
    const updates: Promise<unknown>[] = [];
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { auditId, og } = result.value;
      if (!og.title && !og.description && !og.image) continue;
      freshOgByAuditId.set(auditId, og);
      updates.push(
        db
          .update(audits)
          .set({
            ogTitle: og.title?.slice(0, 200) ?? null,
            ogDescription: og.description?.slice(0, 500) ?? null,
            ogImageUrl: og.image?.slice(0, 1000) ?? null,
          })
          .where(eq(audits.id, auditId)),
      );
    }
    await Promise.allSettled(updates);
  }

  function ogFor(d: DomainRow): OgFields {
    if (!d.lastAuditId) return { title: null, description: null, image: null };
    const fresh = freshOgByAuditId.get(d.lastAuditId);
    if (fresh) return fresh;
    const stored = ogByAuditId.get(d.lastAuditId);
    if (!stored) return { title: null, description: null, image: null };
    return { title: stored.ogTitle, description: stored.ogDescription, image: stored.ogImageUrl };
  }

  return (
    <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
      {domains.map((d) => {
        const unverified = !d.verifiedAt;
        const noRunsYet = !d.lastRunAt;
        const trend = trendsBySource.get(d.sourceUrl) ?? [];
        const og = ogFor(d);
        const grade = gradeOf(d.lastRisk);
        const findingsCount = countMap.get(d.id) ?? 0;
        const description =
          og.description ??
          (unverified
            ? "Pending DNS verification."
            : noRunsYet
            ? "First audit queued — results within minutes."
            : `Audited ${d.lastRunAt!.toISOString().slice(0, 10)} · ${findingsCount} open finding${findingsCount === 1 ? "" : "s"}.`);

        return (
          <article
            key={d.id}
            className="relative mb-4 break-inside-avoid overflow-hidden rounded-[20px] border border-border/70 bg-card/50 p-1.5 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40"
          >
            {unverified ? (
              <Link
                href={`/dashboard/${encodeURIComponent(d.host)}`}
                className="absolute right-3 top-3 z-10 inline-flex items-center rounded-[8px] border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warning shadow-sm hover:bg-warning/20"
              >
                Verify
              </Link>
            ) : (
              <span
                className={`absolute right-3 top-3 z-10 inline-flex h-6 items-center justify-center rounded-[8px] bg-secondary/80 px-2 font-mono text-[10px] uppercase tracking-wider shadow-sm ${
                  noRunsYet ? "text-muted-foreground" : "text-success"
                }`}
              >
                {noRunsYet ? "Queued" : "Live"}
              </span>
            )}

            <SiteThumbnail host={d.host} imageUrl={og.image} />

            <h3 className="mx-1 mt-1 text-base font-semibold tracking-tight">
              <Link
                href={`/dashboard/${encodeURIComponent(d.host)}`}
                className="text-foreground transition-colors hover:text-primary hover:underline"
              >
                {d.host}
              </Link>
            </h3>
            <p className="mx-1 mt-0.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>

            <div className="mx-1 mt-3 flex items-center gap-3">
              <Sparkline points={trend} />
              <GscPill grantExists={gscGrantExists} siteUrl={d.gscSiteUrl} host={d.host} />
            </div>

            <div className="mx-1 mt-3 mr-2 flex items-center justify-between">
              <Link
                href={`/dashboard/${encodeURIComponent(d.host)}`}
                className="font-mono text-[11px] text-muted-foreground hover:text-foreground"
                title="Open findings"
              >
                {findingsCount} {findingsCount === 1 ? "finding" : "findings"}
              </Link>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md font-mono text-sm font-bold ${grade.bg} ${grade.text}`}
                  title={`Grade ${grade.letter} · ${grade.band}`}
                >
                  {grade.letter}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                  {d.lastRisk ?? "—"}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/**
 * Per-domain GSC state. Three distinct states matter — collapsing them to a
 * binary "✓ / Connect" hides the silent-failure case (grant exists but no
 * property bound) which leaves rank scores unweighted by traffic.
 */
function GscPill({
  grantExists,
  siteUrl,
  host,
}: {
  grantExists: boolean;
  siteUrl: string | null;
  host: string;
}) {
  if (!grantExists) {
    return (
      <Link href="/dashboard/integrations" className="font-mono text-[10px] uppercase tracking-wider text-primary hover:underline">
        + GSC
      </Link>
    );
  }
  if (!siteUrl) {
    return (
      <Link
        href={`/dashboard/${encodeURIComponent(host)}/settings`}
        className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warning hover:bg-warning/20"
        title="Search Console is connected but no property is bound to this domain — findings here aren't traffic-weighted"
      >
        Bind GSC →
      </Link>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-success"
      title={`Bound to ${siteUrl} — findings ranked by traffic-at-risk`}
    >
      <span className="inline-block h-1 w-1 rounded-full bg-success" />
      GSC bound
    </span>
  );
}

/**
 * Per-domain risk-trend sparkline. Lets the user scan a multi-domain portfolio
 * for "which one is regressing?" without drilling in. Tone is keyed off the
 * latest run's score band so the eye reads color = current risk, slope =
 * direction. Cold-start state (<2 completed runs) renders a dash so the row
 * doesn't shift width.
 */
function Sparkline({ points }: { points: TrendPoint[] }) {
  const W = 80;
  const H = 20;
  if (points.length < 2) {
    return (
      <span
        className="inline-block font-mono text-[11px] text-muted-foreground/60"
        title="Need two completed runs to chart a trend"
      >
        —
      </span>
    );
  }
  const tMin = points[0].t;
  const tMax = points[points.length - 1].t;
  const tSpan = Math.max(1, tMax - tMin);
  const x = (t: number) => ((t - tMin) / tSpan) * W;
  const y = (r: number) => (1 - Math.min(100, Math.max(0, r)) / 100) * H;
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.risk).toFixed(1)}`)
    .join(" ");
  const latest = points[points.length - 1];
  const first = points[0];
  const delta = latest.risk - first.risk;
  const tone = scoreTone(latest.risk);
  const directionLabel = delta < 0 ? "improving" : delta > 0 ? "regressing" : "flat";
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`h-5 w-20 ${tone}`}
      role="img"
      aria-label={`30-day risk trend, ${directionLabel}`}
    >
      <title>{`30d trend · ${directionLabel} (${first.risk} → ${latest.risk})`}</title>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx={x(latest.t)} cy={y(latest.risk)} r="1.8" fill="currentColor" />
    </svg>
  );
}

/**
 * Card thumbnail. Mirrors the leaderboard's SiteThumbnail — renders the OG
 * image when captured, otherwise a branded gradient + initial. Plain <img>
 * (not Next/Image) so we don't need a remote-pattern allowlist for arbitrary
 * audited hosts; referrer-policy=no-referrer prevents referer leakage.
 */
function SiteThumbnail({ host, imageUrl }: { host: string; imageUrl: string | null }) {
  if (imageUrl) {
    return (
      <div className="aspect-[16/10] overflow-hidden rounded-[14px] border border-border/40 bg-secondary/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={`${host} preview`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  const initial = host.replace(/^www\./, "").charAt(0).toUpperCase();
  return (
    <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-[14px] border border-border/40 bg-gradient-to-br from-secondary/50 via-secondary/20 to-card/60">
      <span className="font-mono text-4xl font-semibold text-muted-foreground/60" aria-hidden>
        {initial}
      </span>
    </div>
  );
}

/**
 * Letter grade derived from risk score (lower-is-safer).
 * Same mapping as the leaderboard so the visual language is consistent across
 * dashboard surfaces — A clean, B good, C concerning, D severe, F critical.
 */
function gradeOf(risk: number | null): { letter: string; band: string; bg: string; text: string } {
  if (risk == null) {
    return { letter: "—", band: "no score yet", bg: "bg-muted/40", text: "text-muted-foreground" };
  }
  if (risk < 20) return { letter: "A", band: "ready · 0–19", bg: "bg-success/15", text: "text-success" };
  if (risk < 40) return { letter: "B", band: "good · 20–39", bg: "bg-success/10", text: "text-success" };
  if (risk < 60) return { letter: "C", band: "concerning · 40–59", bg: "bg-warning/15", text: "text-warning" };
  if (risk < 80) return { letter: "D", band: "severe · 60–79", bg: "bg-warning/25", text: "text-warning" };
  return { letter: "F", band: "critical · 80+", bg: "bg-destructive/15", text: "text-destructive" };
}

function scoreTone(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score < 20) return "text-success";
  if (score < 40) return "text-primary";
  if (score < 60) return "text-warning";
  return "text-destructive";
}
