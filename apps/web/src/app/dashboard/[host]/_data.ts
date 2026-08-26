import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq, gte, isNotNull, isNull, sql } from "drizzle-orm";
import type { AuditSummary } from "@pseolint/core";
import { inferUrlTemplate } from "@pseolint/core";
import { db } from "@/db";
import { withDbRetry } from "@/lib/db-retry";
import {
  audits,
  findingsState,
  gscPageMetrics,
  indexingRequests,
  integrations,
  monitoredDomains,
} from "@/db/schema";
import { fetchSummaryJson, summaryKey } from "@/lib/r2";
import { getOptionalSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { monthBucketUtc } from "@/lib/gsc";

/**
 * Shared loaders for the /dashboard/[host] workspace routes (overview, traffic,
 * monitoring). The workspace is a layout + N sibling pages, and both the layout
 * and the active page need the session, the domain row and (often) the latest
 * audit summary.
 *
 * Every loader is wrapped in React `cache()`, which dedupes by argument for the
 * lifetime of ONE request. Layout and page therefore share a single query
 * instead of doubling it. This matters more than usual here: the pre-split page
 * fired ~18 queries at once and that concurrency was the documented cause of
 * Neon CONNECT_TIMEOUTs (see src/db/index.ts).
 */

export type WorkspaceDomain = typeof monitoredDomains.$inferSelect;
export type LatestAudit = typeof audits.$inferSelect;

/** Session + Pro gate. Every workspace route needs it; cache() makes it free. */
export const requireProSession = cache(async () => {
  const session = await getOptionalSession();
  if (!session) redirect("/signin");
  if ((await getPlan(session.user.id)) !== "pro") redirect("/pricing");
  return session;
});

/**
 * The monitored domain for this workspace. `host` is the RAW (still
 * URL-encoded) route param; decoding lives here so every caller passes the same
 * cache key and callers can't drift on encode/decode.
 */
export const getWorkspaceDomain = cache(async (rawHost: string): Promise<WorkspaceDomain> => {
  const session = await requireProSession();
  const host = decodeURIComponent(rawHost);
  const [domain] = await withDbRetry(() =>
    db
      .select()
      .from(monitoredDomains)
      .where(
        and(
          eq(monitoredDomains.host, host),
          eq(monitoredDomains.userId, session.user.id),
          isNull(monitoredDomains.removedAt),
        ),
      )
      .limit(1),
  );
  if (!domain) notFound();
  return domain;
});

/** Every domain this user still monitors: powers the workspace domain switcher. */
export const listWorkspaceDomains = cache(async (): Promise<{ host: string; paused: boolean }[]> => {
  const session = await requireProSession();
  return withDbRetry(() =>
    db
      .select({ host: monitoredDomains.host, paused: monitoredDomains.paused })
      .from(monitoredDomains)
      .where(and(eq(monitoredDomains.userId, session.user.id), isNull(monitoredDomains.removedAt)))
      .orderBy(monitoredDomains.host),
  );
});

/** Most recent completed audit for the domain, or null when none has finished. */
export const getLatestAudit = cache(async (rawHost: string): Promise<LatestAudit | null> => {
  const session = await requireProSession();
  const domain = await getWorkspaceDomain(rawHost);
  const rows = await withDbRetry(() =>
    db
      .select()
      .from(audits)
      .where(
        and(
          eq(audits.userId, session.user.id),
          eq(audits.sourceUrl, domain.sourceUrl),
          eq(audits.status, "completed"),
        ),
      )
      .orderBy(desc(audits.completedAt))
      .limit(1),
  );
  return rows[0] ?? null;
});

/**
 * The engine's full report JSON from R2. Overview and monitoring both read it
 * (tiles, triage, templates, origin readiness), so without the cache() the
 * split would turn one R2 GET into several per request.
 */
export const getLatestSummary = cache(async (rawHost: string): Promise<AuditSummary | null> => {
  const latest = await getLatestAudit(rawHost);
  if (!latest?.storageKey) return null;
  const raw = await fetchSummaryJson(summaryKey(latest.id));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuditSummary;
  } catch {
    // A corrupt/partial object is indistinguishable from "no report" to every
    // caller here, and each one already renders an empty state for null.
    return null;
  }
});


// ---------------------------------------------------------------------------
// Search Console
// ---------------------------------------------------------------------------

export type GscVariant =
  | "not-connected"
  | "connected-not-bound"
  | "bound-no-data"
  | "bound-with-data";

export interface GscSnapshot {
  variant: GscVariant;
  siteUrl: string | null;
  lastSyncAt: Date | null;
  totalImpressions: number;
  totalClicks: number;
  /** Impressions-weighted mean position, or null when no impressions landed. */
  weightedAvgPosition: number | null;
  /** Domain-level CTR (total clicks / total impressions), or null. */
  ctr: number | null;
  /** Last 6 month buckets, oldest → newest. */
  monthlyTrend: { monthBucket: string; impressions: number; clicks: number }[];
  /** Top 3 templates by current-month impressions. */
  topTemplates: { signature: string; impressions: number; clicks: number }[];
  /** Per-template traffic, keyed by template signature: powers findings chips. */
  trafficBySignature: Map<string, { impressions: number; clicks: number }>;
}

/**
 * Whether the user holds a GSC grant at all. Cheap (one indexed lookup) and
 * separate from {@link getGscSnapshot} on purpose: overview only needs to know
 * whether to nag, and shouldn't pay for the per-URL metrics scan to find out.
 */
export const getGscIntegration = cache(async (): Promise<{ lastSyncAt: Date | null } | null> => {
  const session = await requireProSession();
  const rows = await withDbRetry(() =>
    db
      .select({ lastSyncAt: integrations.lastSyncAt })
      .from(integrations)
      .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")))
      .limit(1),
  );
  return rows[0] ?? null;
});

/**
 * Full Search Console picture for one domain, including the per-URL metrics
 * scan. This is the single most expensive query in the workspace, which is why
 * it lives behind its own loader: the traffic tab awaits it directly, while
 * overview only reaches it inside a Suspense boundary (for per-finding traffic
 * chips) so it can never delay the verdict.
 */
export const getGscSnapshot = cache(async (rawHost: string): Promise<GscSnapshot> => {
  const domain = await getWorkspaceDomain(rawHost);
  const integration = await getGscIntegration();

  const empty = (variant: GscVariant): GscSnapshot => ({
    variant,
    siteUrl: domain.gscSiteUrl,
    lastSyncAt: integration?.lastSyncAt ?? null,
    totalImpressions: 0,
    totalClicks: 0,
    weightedAvgPosition: null,
    ctr: null,
    monthlyTrend: [],
    topTemplates: [],
    trafficBySignature: new Map(),
  });

  if (!integration) return empty("not-connected");
  if (!domain.gscSiteUrl) return empty("connected-not-bound");

  const [rows, trend] = await withDbRetry(() =>
    Promise.all([
      db
        .select({
          url: gscPageMetrics.url,
          impressions: gscPageMetrics.impressions,
          clicks: gscPageMetrics.clicks,
          positionAvg: gscPageMetrics.positionAvg,
          ctrAvg: gscPageMetrics.ctrAvg,
        })
        .from(gscPageMetrics)
        .where(
          and(
            eq(gscPageMetrics.domainId, domain.id),
            eq(gscPageMetrics.monthBucket, monthBucketUtc()),
          ),
        )
        .orderBy(desc(gscPageMetrics.impressions))
        // Cap 2000 (raised from 500 now that we're on a paid Neon plan: monthly
        // transfer is no longer the binding constraint; the original 500 was a
        // free-tier transfer guard after paperforge.dev, 2026-05-06, dumped every
        // row per render). Still bounded for render perf. Top-500 by impressions
        // already covers >95% of traffic-weighted volume; the extra rows improve
        // long-tail template attribution on very large (25k+ page) sites.
        .limit(2000),
      db
        .select({
          monthBucket: gscPageMetrics.monthBucket,
          impressions: sql<number>`coalesce(sum(${gscPageMetrics.impressions}), 0)::int`,
          clicks: sql<number>`coalesce(sum(${gscPageMetrics.clicks}), 0)::int`,
        })
        .from(gscPageMetrics)
        .where(eq(gscPageMetrics.domainId, domain.id))
        .groupBy(gscPageMetrics.monthBucket)
        .orderBy(desc(gscPageMetrics.monthBucket))
        .limit(6),
    ]),
  );

  if (rows.length === 0) return empty("bound-no-data");

  // Aggregate URL-level metrics up to the same template signature used for
  // grouping findings (e.g. /blog/:slug). Findings fan out across many URLs
  // sharing one template, so impressions must too: otherwise traffic-by-page
  // wouldn't match the rank score's traffic weighting.
  const trafficBySignature = new Map<string, { impressions: number; clicks: number }>();
  let totalImpressions = 0;
  let totalClicks = 0;
  // Impressions-weighted average position. A naive mean across URLs would
  // overcount low-traffic outliers: a 0-impression page at avg position 80
  // would drag the headline into territory that doesn't reflect where the
  // operator's actual traffic is ranking.
  let positionWeightedSum = 0;
  let positionWeightDenom = 0;
  for (const r of rows) {
    let sig: string;
    try {
      sig = inferUrlTemplate(r.url);
    } catch {
      sig = r.url;
    }
    const cur = trafficBySignature.get(sig) ?? { impressions: 0, clicks: 0 };
    cur.impressions += r.impressions;
    cur.clicks += r.clicks;
    trafficBySignature.set(sig, cur);
    totalImpressions += r.impressions;
    totalClicks += r.clicks;
    if (r.positionAvg != null && r.impressions > 0) {
      positionWeightedSum += Number(r.positionAvg) * r.impressions;
      positionWeightDenom += r.impressions;
    }
  }

  return {
    variant: "bound-with-data",
    siteUrl: domain.gscSiteUrl,
    lastSyncAt: integration.lastSyncAt,
    totalImpressions,
    totalClicks,
    weightedAvgPosition: positionWeightDenom > 0 ? positionWeightedSum / positionWeightDenom : null,
    // CTR = total clicks / total impressions; matches what GSC reports as the
    // domain-level CTR rather than the unweighted mean of per-URL ctrAvg.
    ctr: totalImpressions > 0 ? totalClicks / totalImpressions : null,
    // gscTrend is desc(monthBucket) limit 6; reverse so the sparkline reads
    // oldest → newest, left to right.
    monthlyTrend: [...trend].reverse().map((row) => ({
      monthBucket: row.monthBucket,
      impressions: Number(row.impressions),
      clicks: Number(row.clicks),
    })),
    topTemplates: Array.from(trafficBySignature.entries())
      .map(([signature, t]) => ({ signature, impressions: t.impressions, clicks: t.clicks }))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 3),
    trafficBySignature,
  };
});

// ---------------------------------------------------------------------------
// Runs, findings and indexing
// ---------------------------------------------------------------------------

export interface TimelineRun {
  slug: string;
  risk: number | null;
  status: string;
  completedAt: Date | null;
  findingCount: number | null;
}

/**
 * Last 30 days of runs, newest first. Overview reads it for the risk delta on
 * the headline; monitoring reads it for the trend chart, alert simulator and
 * run picker. One query either way thanks to cache().
 */
export const getTimelineRuns = cache(async (rawHost: string): Promise<TimelineRun[]> => {
  const session = await requireProSession();
  const domain = await getWorkspaceDomain(rawHost);
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  return withDbRetry(() =>
    db
      .select({
        slug: audits.slug,
        risk: audits.risk,
        status: audits.status,
        completedAt: audits.completedAt,
        findingCount: audits.findingCount,
      })
      .from(audits)
      .where(
        and(
          eq(audits.userId, session.user.id),
          eq(audits.sourceUrl, domain.sourceUrl),
          gte(audits.createdAt, since),
        ),
      )
      .orderBy(desc(audits.createdAt))
      .limit(60),
  );
});

/** Open findings for this domain, ranked. Capped at 200 (the work surface). */
export const getOpenFindings = cache(async (rawHost: string) => {
  const domain = await getWorkspaceDomain(rawHost);
  return withDbRetry(() =>
    db
      .select()
      .from(findingsState)
      .where(eq(findingsState.domainId, domain.id))
      .orderBy(desc(findingsState.rankScore))
      .limit(200),
  );
});

/** Indexing providers this user has connected, plus this domain's push history. */
export const getIndexingState = cache(async (rawHost: string) => {
  const session = await requireProSession();
  const domain = await getWorkspaceDomain(rawHost);
  const [connected, requests] = await withDbRetry(() =>
    Promise.all([
      db
        .select({ kind: integrations.kind })
        .from(integrations)
        .where(
          and(
            eq(integrations.userId, session.user.id),
            sql`${integrations.kind} in ('google-indexing', 'indexnow')`,
          ),
        ),
      db
        .select({
          url: indexingRequests.url,
          provider: indexingRequests.provider,
          status: indexingRequests.status,
          error: indexingRequests.error,
          createdAt: indexingRequests.createdAt,
        })
        .from(indexingRequests)
        .where(eq(indexingRequests.domainId, domain.id))
        .orderBy(desc(indexingRequests.createdAt)),
    ]),
  );
  return {
    providers: connected
      .map((i) => i.kind)
      .filter((k): k is "google-indexing" | "indexnow" => k === "google-indexing" || k === "indexnow"),
    recentRequests: requests,
  };
});

/** URLs Google has actually shown (impressions ≥ 1): the "already indexed" set. */
export const getIndexedUrls = cache(async (rawHost: string): Promise<string[]> => {
  const domain = await getWorkspaceDomain(rawHost);
  const rows = await withDbRetry(() =>
    db
      .select({ url: gscPageMetrics.url })
      .from(gscPageMetrics)
      .where(and(eq(gscPageMetrics.domainId, domain.id), gte(gscPageMetrics.impressions, 1))),
  );
  return rows.map((r) => r.url);
});

/**
 * Pages the engine has seen whose findings are ALL resolved, minus anything
 * Google already surfaces: the crawl-request candidates for the quick indexer.
 * Capped at 100 to keep the picker usable.
 */
export const getCleanCandidateUrls = cache(async (rawHost: string): Promise<string[]> => {
  const domain = await getWorkspaceDomain(rawHost);
  const [openFindings, allRows, indexedUrls] = await Promise.all([
    getOpenFindings(rawHost),
    withDbRetry(() =>
      db
        .selectDistinct({ url: findingsState.representativeUrl })
        .from(findingsState)
        .where(
          and(eq(findingsState.domainId, domain.id), isNotNull(findingsState.representativeUrl)),
        ),
    ),
    getIndexedUrls(rawHost),
  ]);

  const dirty = new Set(
    openFindings.map((f) => f.representativeUrl).filter((u): u is string => u != null),
  );
  const indexed = new Set(indexedUrls);
  return allRows
    .map((r) => r.url)
    .filter((u): u is string => u != null)
    .filter((u) => !dirty.has(u) && !indexed.has(u))
    .slice(0, 100);
});

// ---------------------------------------------------------------------------
// Report-derived helpers (pure)
// ---------------------------------------------------------------------------

export interface FindingMeta {
  confidence?: "high" | "medium" | "low" | "speculative";
  carriedForward?: boolean;
  lastVerifiedAt?: string | null;
  effort?: "quick" | "moderate" | "structural";
}

/**
 * Per-finding metadata from the latest report, keyed `${ruleId}::${signature}`.
 *
 * The key must match how findingsState groups rows, which is by inferred URL
 * template rather than by URL: one finding row stands for every page sharing a
 * template. Rule results without a pageUrl are global, so they share the
 * `__global__` bucket. A URL that inferUrlTemplate can't parse falls back to
 * the raw URL, which still groups consistently with the writer side.
 *
 * Pure and exported so both consumers (the run-diff's carried-forward filter
 * and the findings panel's enrichment) derive identical keys.
 */
export function buildFindingsMeta(summary: AuditSummary | null): Map<string, FindingMeta> {
  const map = new Map<string, FindingMeta>();
  if (!summary) return map;
  const all = [
    ...(summary.issues?.blockers ?? []),
    ...(summary.issues?.shouldFix ?? []),
    ...(summary.issues?.informational ?? []),
  ];
  for (const r of all) {
    let sig = "__global__";
    if (r.pageUrl) {
      try {
        sig = inferUrlTemplate(r.pageUrl);
      } catch {
        sig = r.pageUrl;
      }
    }
    map.set(`${r.ruleId}::${sig}`, {
      confidence: r.confidence,
      carriedForward: r.carriedForward,
      lastVerifiedAt: r.lastVerifiedAt,
      effort: r.effort,
    });
  }
  return map;
}
