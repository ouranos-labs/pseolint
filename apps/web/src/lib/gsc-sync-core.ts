/**
 * Shared sync logic for both the daily cron and the on-demand GSC sync functions.
 *
 * Extracted here so `sync-gsc.ts` (cron) and `sync-gsc-on-demand.ts` (event)
 * can both call the same upsert path without duplicating business logic.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { gscPageMetrics } from "@/db/schema";
import { auditLog } from "@/lib/audit-log";
import { markGscSynced, querySearchAnalyticsByPage } from "@/lib/gsc";

/** Insert chunk size; keeps individual statements bounded for very large GSC datasets. */
const UPSERT_CHUNK = 500;

export interface SyncOneDomainInput {
  domainId: string;
  userId: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  monthBucket: string;
}

export async function syncOneDomain(input: SyncOneDomainInput): Promise<boolean> {
  try {
    const rows = await querySearchAnalyticsByPage(
      input.userId,
      input.siteUrl,
      input.startDate,
      input.endDate,
    );
    if (rows.length === 0) {
      await markGscSynced(input.userId);
      auditLog("gsc.sync.empty", { domainId: input.domainId, siteUrl: input.siteUrl });
      return true;
    }

    for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
      const chunk = rows.slice(i, i + UPSERT_CHUNK);
      const values = chunk.map((r) => ({
        domainId: input.domainId,
        url: r.url,
        monthBucket: input.monthBucket,
        impressions: Math.round(r.impressions),
        clicks: Math.round(r.clicks),
        positionAvg: r.position.toFixed(2),
        ctrAvg: r.ctr.toFixed(4),
        fetchedAt: new Date(),
      }));
      await db.insert(gscPageMetrics).values(values).onConflictDoUpdate({
        target: [gscPageMetrics.domainId, gscPageMetrics.url, gscPageMetrics.monthBucket],
        set: {
          impressions: sql`excluded.impressions`,
          clicks: sql`excluded.clicks`,
          positionAvg: sql`excluded.position_avg`,
          ctrAvg: sql`excluded.ctr_avg`,
          fetchedAt: sql`excluded.fetched_at`,
        },
      });
    }

    await markGscSynced(input.userId);
    auditLog("gsc.sync.ok", { domainId: input.domainId, siteUrl: input.siteUrl, rowCount: rows.length });
    return true;
  } catch (e) {
    auditLog("gsc.sync.failed", {
      domainId: input.domainId,
      siteUrl: input.siteUrl,
      err: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
