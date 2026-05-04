import Link from "next/link";
import { db } from "@/db";
import { audits, findingsState, monitoredDomains, integrations } from "@/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { fetchOgMeta } from "@/lib/og-fetch";
import { GradeChip } from "@/components/audit/grade-chip";
import { Sparkline, type TrendPoint } from "@/components/audit/sparkline";
import { SiteThumbnail } from "@/components/audit/site-thumbnail";

type DomainRow = typeof monitoredDomains.$inferSelect;

interface PortfolioStripProps {
  domains: DomainRow[];
  userId: string;
}

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
    <div className="flex flex-col gap-4 md:block md:columns-2 xl:columns-3">
      {domains.map((d) => {
        const unverified = !d.verifiedAt;
        const noRunsYet = !d.lastRunAt;
        const trend = trendsBySource.get(d.sourceUrl) ?? [];
        const og = ogFor(d);
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
            className="relative break-inside-avoid overflow-hidden rounded-[20px] border border-border/70 bg-card/50 p-1.5 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/40 md:mb-4"
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
              <GradeChip risk={d.lastRisk} />
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

