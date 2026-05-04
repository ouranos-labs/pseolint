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
 *
 * Per-domain sync logic lives in @/lib/gsc-sync-core and is shared with
 * the on-demand sync function (sync-gsc-on-demand.ts).
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { integrations, monitoredDomains } from "@/db/schema";
import { auditLog } from "@/lib/audit-log";
import { monthBucketUtc, rollingDateRange } from "@/lib/gsc";
import { syncOneDomain } from "@/lib/gsc-sync-core";

/** Cap per cron tick — protects the GSC API quota and keeps the function within Inngest's runtime budget. */
const MAX_DOMAINS_PER_TICK = 50;

export const syncGsc = inngest.createFunction(
  { id: "sync-gsc", retries: 1 },
  { cron: "0 2 * * *" },
  async ({ step }) => {
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
