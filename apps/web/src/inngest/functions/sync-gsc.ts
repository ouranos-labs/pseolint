/**
 * Daily GSC sync — pulls per-page Search Analytics for every monitored
 * domain that has both an active OAuth grant AND a bound property URL,
 * then upserts the rows into `gscPageMetrics` for the current month bucket.
 *
 * Trailing-28-day window stamped as "current month": the bucket is the
 * stable ranking key, and we accept some leakage from the previous month
 * around the 1st in exchange for always-fresh data.
 *
 * Per-user errors do not block the rest of the run — a revoked OAuth grant
 * for one user must not stop the cron for everyone else.
 */
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { gscPageMetrics, integrations, monitoredDomains } from "@/db/schema";
import { auditLog } from "@/lib/audit-log";
import { auditMode } from "@/lib/audit-mode";
import {
  markGscSynced,
  monthBucketUtc,
  querySearchAnalyticsByPage,
  rollingDateRange,
} from "@/lib/gsc";

/** Cap per cron tick — protects the GSC API quota and keeps the function within Inngest's runtime budget. */
const MAX_DOMAINS_PER_TICK = 50;

/** Insert chunk size — keeps individual statements bounded for very large GSC datasets. */
const UPSERT_CHUNK = 500;

export const syncGsc = inngest.createFunction(
  { id: "sync-gsc", retries: 1 },
  { cron: "0 2 * * *" },
  async ({ step }) => {
    if (auditMode() !== "normal") {
      auditLog("gsc.sync.start", { skipped: `mode=${auditMode()}` });
      return { synced: 0, skipped: `mode=${auditMode()}` };
    }
    auditLog("gsc.sync.start", {});

    // Domains with: gscSiteUrl bound + owner has GSC integration + verified + active.
    const targets = await step.run("fetch-targets", async () =>
      db
        .select({
          domainId: monitoredDomains.id,
          userId: monitoredDomains.userId,
          host: monitoredDomains.host,
          gscSiteUrl: monitoredDomains.gscSiteUrl,
        })
        .from(monitoredDomains)
        .innerJoin(integrations, and(
          eq(integrations.userId, monitoredDomains.userId),
          eq(integrations.kind, "gsc"),
        ))
        .where(and(
          isNotNull(monitoredDomains.gscSiteUrl),
          isNotNull(monitoredDomains.verifiedAt),
          isNull(monitoredDomains.removedAt),
          eq(monitoredDomains.paused, false),
          isNotNull(integrations.encryptedTokens),
        ))
        .limit(MAX_DOMAINS_PER_TICK),
    );

    let synced = 0;
    let failed = 0;
    const { startDate, endDate } = rollingDateRange(28);
    const monthBucket = monthBucketUtc();

    for (const t of targets) {
      if (!t.gscSiteUrl) continue;
      const ok = await step.run(`sync-${t.domainId}`, async () =>
        syncOneDomain({
          domainId: t.domainId,
          userId: t.userId,
          siteUrl: t.gscSiteUrl!,
          startDate,
          endDate,
          monthBucket,
        }),
      );
      if (ok) synced++; else failed++;
    }

    return { synced, failed, candidates: targets.length };
  },
);

async function syncOneDomain(input: {
  domainId: string;
  userId: string;
  siteUrl: string;
  startDate: string;
  endDate: string;
  monthBucket: string;
}): Promise<boolean> {
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
      // EXCLUDED-style upsert: each row contributes its own values to the SET
      // clause, so a single bulk INSERT can refresh thousands of pages atomically.
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
