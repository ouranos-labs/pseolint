import { and, asc, eq, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits, watchedPages } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { inngest } from "@/lib/inngest";
import { MAX_PRO_DOMAINS } from "@/lib/tier-limits";
import { PRO_REAUDIT_SAMPLE_SIZE } from "@/lib/audit-limits";
import { generateVerificationToken } from "@/lib/domain-verify";
import { autoBindGscPropertiesForUser } from "@/lib/gsc";

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
    .select({
      id: monitoredDomains.id,
      removedAt: monitoredDomains.removedAt,
      verifiedAt: monitoredDomains.verifiedAt,
    })
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
      // Ownership must be re-proven on every re-add — same rule as
      // addDomainAction's reactivate branch.
      await db
        .update(monitoredDomains)
        .set({
          removedAt: null,
          sourceUrl: origin,
          verificationToken: generateVerificationToken(),
          verifiedAt: null,
        })
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
      // Without a token the auto-verify cron skips the row and the workspace
      // verify banner has nothing to display — the domain would be stuck
      // unverifiable until the user clicked Verify twice.
      verificationToken: generateVerificationToken(),
    });
  }

  // Checkout usually follows a free audit, so the user may already have Search
  // Console connected. Binding it here also verifies the domain when the
  // property proves ownership, which spares a fresh Pro subscriber the TXT
  // record. Best-effort by contract — returns zero counts on any failure.
  await autoBindGscPropertiesForUser(userId);

  const [domRow] = await db
    .select({ id: monitoredDomains.id, verifiedAt: monitoredDomains.verifiedAt })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, userId), eq(monitoredDomains.host, host)))
    .limit(1);

  // Ownership gate — mirrors addDomainAction. No kickoff crawl for an
  // unverified domain; monitor-domains picks it up once `verifiedAt` lands.
  if (!domRow?.verifiedAt) return { host };

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
  const watchedUrls = await loadWatchedUrlsForDomain(domRow.id);

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
 * Domains eligible for a monitoring run right now: due, not paused, not
 * soft-removed, and — the gate that matters — ownership-verified. A row failing
 * any of these must never reach the auditor.
 *
 * Extracted from the `monitor-domains` cron (its only production caller) so the
 * eligibility predicate can be exercised directly against a real database
 * instead of being re-implemented by a test.
 */
/**
 * Either the pooled client or an open transaction. Accepting a transaction lets
 * the DB-backed eligibility test seed rows, assert against them, and roll back —
 * so a suite pointed at a live database commits nothing and the monitoring cron
 * can never observe its fixtures.
 */
type Conn = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export function selectDueDomains(limit: number, conn: Conn = db) {
  return conn
    .select()
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.paused, false),
      lte(monitoredDomains.nextRunAt, new Date()),
      isNull(monitoredDomains.removedAt),
      // Ownership proof: a DNS TXT record, or a Search Console property the
      // user owns (see `provesGscOwnership`).
      isNotNull(monitoredDomains.verifiedAt),
    ))
    .limit(limit);
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
  // Canonicalize to `${protocol}//${host}` and match audits whose sourceUrl is
  // either the bare origin, the origin + "/", or any path under it. Without
  // this, trailing-slash drift between the monitoring path (origin only) and
  // /api/audits path (full normalized URL) caused legitimate audit history to
  // miss this domain in the cumulative count.
  const origin = canonicalOrigin(args.sourceUrl);
  const matchOrigin = or(
    eq(audits.sourceUrl, origin),
    eq(audits.sourceUrl, `${origin}/`),
    like(audits.sourceUrl, `${origin}/%`),
  );
  // NOTE: pass `since` as an ISO string, NOT a raw Date. drizzle-orm/postgres-js
  // cannot serialize a JS Date interpolated into a raw sql`` template — it throws
  // ERR_INVALID_ARG_TYPE ("Received an instance of Date"). (The old
  // @neondatabase/serverless driver tolerated it; postgres.js does not. This was
  // the cause of the /dashboard/[host] render crash after the 2026-06-05 driver
  // migration.) Postgres coerces the text param back to timestamptz against
  // completed_at. Typed Drizzle operators like gte() handle Dates fine; only raw
  // sql`` interpolation needs this.
  const sinceIso = since.toISOString();
  const [row] = await db
    .select({
      urlsAuditedTotal: sql<number>`coalesce(sum(${audits.pageCount}), 0)::int`,
      urlsAuditedLast30d: sql<number>`coalesce(sum(case when ${audits.completedAt} >= ${sinceIso} then ${audits.pageCount} else 0 end), 0)::int`,
    })
    .from(audits)
    .where(and(
      eq(audits.userId, args.userId),
      matchOrigin,
      eq(audits.status, "completed"),
    ));
  return {
    urlsAuditedTotal: row?.urlsAuditedTotal ?? 0,
    urlsAuditedLast30d: row?.urlsAuditedLast30d ?? 0,
  };
}

/**
 * Reduce a stored `sourceUrl` to `${protocol}//${host}` (lowercased). Both
 * `monitored_domain.source_url` and `audits.source_url` are server-set, so the
 * only hostnames that flow through here come from validated URL parsing —
 * they never legally contain `%` / `_` / `\` (LIKE wildcards). Returns "" on
 * parse failure so a single corrupt DB row can't bleed wildcard characters
 * into the LIKE pattern downstream and inflate the match set.
 */
function canonicalOrigin(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return "";
  }
}

