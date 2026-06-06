import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { growthSearchMetrics, users } from "@/db/schema";
import { env } from "@/lib/env";
import {
  loadGscTokens,
  querySearchAnalyticsByPageQuery,
  rollingDateRange,
  weekBucketUtc,
} from "@/lib/gsc";
import { aggregateGrowthRows, GROWTH_PREFIXES, type GrowthMetricRow } from "@/lib/growth-metrics";
import { auditLog } from "@/lib/audit-log";

const UPSERT_CHUNK = 500;

export type GrowthSyncResult = {
  status: "unconfigured" | "owner-not-found" | "no-grant" | "empty" | "ok" | "failed";
  rowCount?: number;
};

function toValues(rows: GrowthMetricRow[], weekBucket: string) {
  return rows.map((r) => ({
    url: r.url,
    query: r.query,
    weekBucket,
    impressions: Math.round(r.impressions),
    clicks: Math.round(r.clicks),
    positionAvg: r.positionAvg == null ? null : r.positionAvg.toFixed(2),
    ctrAvg: r.ctrAvg == null ? null : r.ctrAvg.toFixed(4),
    fetchedAt: new Date(),
  }));
}

/**
 * Pull pseolint.dev's own GSC property (page+query), aggregate to growth rows,
 * and upsert them for the current ISO-week bucket. Self-contained and
 * best-effort — any failure is logged and returned as a status, never thrown,
 * so the weekly cron schedule never wedges.
 */
export async function growthSyncOnce(): Promise<GrowthSyncResult> {
  const e = env();
  if (!e.GROWTH_GSC_SITE_URL || !e.GROWTH_GSC_OWNER_EMAIL) {
    auditLog("growth.sync.skip", { reason: "unconfigured" });
    return { status: "unconfigured" };
  }

  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, e.GROWTH_GSC_OWNER_EMAIL))
    .limit(1);
  if (!owner) {
    auditLog("growth.sync.skip", { reason: "owner-not-found" });
    return { status: "owner-not-found" };
  }

  const tokens = await loadGscTokens(owner.id);
  if (!tokens) {
    auditLog("growth.sync.skip", { reason: "no-grant" });
    return { status: "no-grant" };
  }

  const { startDate, endDate } = rollingDateRange(28);
  const weekBucket = weekBucketUtc();

  try {
    const raw = await querySearchAnalyticsByPageQuery(owner.id, e.GROWTH_GSC_SITE_URL, startDate, endDate);
    const { pageRows, pageQueryRows } = aggregateGrowthRows(raw, { growthPrefixes: GROWTH_PREFIXES });
    const all = [...pageRows, ...pageQueryRows];

    if (all.length === 0) {
      auditLog("growth.sync.empty", { siteUrl: e.GROWTH_GSC_SITE_URL });
      return { status: "empty", rowCount: 0 };
    }

    for (let i = 0; i < all.length; i += UPSERT_CHUNK) {
      const values = toValues(all.slice(i, i + UPSERT_CHUNK), weekBucket);
      await db.insert(growthSearchMetrics).values(values).onConflictDoUpdate({
        target: [growthSearchMetrics.url, growthSearchMetrics.query, growthSearchMetrics.weekBucket],
        set: {
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          positionAvg: sql`excluded.position_avg`,
          ctrAvg: sql`excluded.ctr_avg`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
    }

    auditLog("growth.sync.ok", { siteUrl: e.GROWTH_GSC_SITE_URL, rowCount: all.length });
    return { status: "ok", rowCount: all.length };
  } catch (err) {
    auditLog("growth.sync.failed", { err: err instanceof Error ? err.message : String(err) });
    return { status: "failed" };
  }
}
