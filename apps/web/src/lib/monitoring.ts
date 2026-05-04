import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits, watchedPages } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { inngest } from "@/lib/inngest";
import { MAX_PRO_DOMAINS } from "@/lib/tier-limits";
import { PRO_REAUDIT_SAMPLE_SIZE } from "@/lib/audit-limits";

/**
 * Webhook-safe variant of addDomainAction — no session required.
 * Called from the Polar webhook when monitor-intent checkout completes.
 * Caller is responsible for verifying that the userId + audit ownership match.
 */
export async function ensureMonitoredDomainForUser(
  userId: string,
  rawUrl: string,
): Promise<{ host: string }> {
  const u = new URL(rawUrl);
  const host = u.host;
  const origin = `${u.protocol}//${u.host}`;

  const [existing] = await db
    .select({ id: monitoredDomains.id, removedAt: monitoredDomains.removedAt })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, userId), eq(monitoredDomains.host, host)))
    .limit(1);

  if (existing) {
    if (existing.removedAt) {
      const [{ active }] = await db
        .select({ active: sql<number>`count(*)::int` })
        .from(monitoredDomains)
        .where(and(eq(monitoredDomains.userId, userId), isNull(monitoredDomains.removedAt)));
      if (active >= MAX_PRO_DOMAINS) {
        throw new Error(`Pro domain cap reached (${MAX_PRO_DOMAINS})`);
      }
      await db
        .update(monitoredDomains)
        .set({ removedAt: null, sourceUrl: origin })
        .where(eq(monitoredDomains.id, existing.id));
    }
  } else {
    const [{ active }] = await db
      .select({ active: sql<number>`count(*)::int` })
      .from(monitoredDomains)
      .where(and(eq(monitoredDomains.userId, userId), isNull(monitoredDomains.removedAt)));
    if (active >= MAX_PRO_DOMAINS) {
      throw new Error(`Pro domain cap reached (${MAX_PRO_DOMAINS})`);
    }
    await db.insert(monitoredDomains).values({
      slug: publicSlug(),
      userId,
      sourceUrl: origin,
      host,
      cadence: "daily",
      nextRunAt: new Date(),
    });
  }

  const auditSlug = publicSlug();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const [audit] = await db
    .insert(audits)
    .values({
      slug: auditSlug,
      userId,
      sourceUrl: origin,
      status: "queued",
      expiresAt,
      isPublic: false,
    })
    .returning({ id: audits.id });

  // v0.5.3 — load any existing watched URLs for the domain (re-activated
  // domains may already have a list) so the kickoff audit forces them.
  const [domRow] = await db
    .select({ id: monitoredDomains.id })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, userId), eq(monitoredDomains.host, host)))
    .limit(1);
  const watchedUrls = domRow ? await loadWatchedUrlsForDomain(domRow.id) : [];

  await inngest.send({
    name: "audit/requested",
    data: {
      auditId: audit.id,
      url: origin,
      plan: "pro",
      sampleSize: PRO_REAUDIT_SAMPLE_SIZE,
      ...(watchedUrls.length > 0 && { force: { urls: watchedUrls } }),
    },
  });

  return { host };
}

/**
 * v0.5.3 — load watched-page URLs for a monitored domain, deduped + ordered.
 * Keep this lightweight (single column, single index hit). Used by every
 * monitoring entry point to thread `opts.force.urls` into the engine.
 */
export async function loadWatchedUrlsForDomain(monitoredDomainId: string): Promise<string[]> {
  const rows = await db
    .select({ url: watchedPages.url })
    .from(watchedPages)
    .where(eq(watchedPages.monitoredDomainId, monitoredDomainId))
    .orderBy(asc(watchedPages.createdAt));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r.url);
  }
  return out;
}

/**
 * v0.5.3 cumulative coverage: sum of `audits.pageCount` for a monitored
 * domain's completed history.
 *
 * Storage choice: Postgres only. We considered reading per-audit URL lists
 * from R2 to compute *distinct* URL coverage, but `ScrapePlanSummary`
 * (mirrored on `audits.scrapePlan`) carries only counts — no URLs — and
 * round-tripping to R2 on every workspace render is too heavy for a domain
 * with weeks-to-months of audits. We pay the honesty cost in the card
 * label: "URLs audited (cumulative)" rather than "distinct URLs observed".
 *
 * Caller is responsible for authorization — pass a domainId you have already
 * proven the current user owns. The query also matches on `audits.userId`
 * defensively so a leaked domainId can't surface another user's audit
 * counts.
 *
 * @returns total URLs audited across all completed runs for this domain,
 *          plus the 30-day window. Both fields are zero when the domain
 *          has no completed audit history yet.
 */
// TODO(v0.6): precompute as a materialized view if a single domain ever
// accumulates more than O(100) completed audits — current scan is fine
// for v0.5.3 (12 weeks of weekly audits = 12 rows).
export async function getCumulativeCoverage(args: {
  monitoredDomainId: string;
  userId: string;
  sourceUrl: string;
}): Promise<{ urlsAuditedTotal: number; urlsAuditedLast30d: number }> {
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [row] = await db
    .select({
      urlsAuditedTotal: sql<number>`coalesce(sum(${audits.pageCount}), 0)::int`,
      urlsAuditedLast30d: sql<number>`coalesce(sum(case when ${audits.completedAt} >= ${since} then ${audits.pageCount} else 0 end), 0)::int`,
    })
    .from(audits)
    .where(and(
      eq(audits.userId, args.userId),
      eq(audits.sourceUrl, args.sourceUrl),
      eq(audits.status, "completed"),
    ));
  return {
    urlsAuditedTotal: row?.urlsAuditedTotal ?? 0,
    urlsAuditedLast30d: row?.urlsAuditedLast30d ?? 0,
  };
}

