/**
 * On-demand GSC sync for a single domain, triggered by the `gsc/sync-requested` event.
 *
 * Called from POST /api/gsc/refresh/[host]: rate-limited at the HTTP layer to
 * 1 request/hour per user-host pair. This function does not enforce its own
 * rate limit because the API route already does.
 *
 * Shares `syncOneDomain` with the daily cron via `@/lib/gsc-sync-core` but
 * targets only the specific (userId, domainId) pair from the event, so it
 * does not walk all users.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { integrations, monitoredDomains } from "@/db/schema";
import { auditLog } from "@/lib/audit-log";
import { monthBucketUtc, rollingDateRange } from "@/lib/gsc";
import { syncOneDomain } from "@/lib/gsc-sync-core";

export const syncGscOnDemand = inngest.createFunction(
  { id: "sync-gsc-on-demand", retries: 0 },
  { event: "gsc/sync-requested" },
  async ({ event, step }) => {
    const { userId, domainId } = event.data;
    auditLog("gsc.sync.start", { userId, domainId, trigger: "on-demand" });

    const [target] = await step.run("fetch-target", async () =>
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
          isNotNull(integrations.encryptedTokens),
        ))
        .where(and(
          eq(monitoredDomains.id, domainId),
          eq(monitoredDomains.userId, userId),
          isNotNull(monitoredDomains.gscSiteUrl),
          isNotNull(monitoredDomains.verifiedAt),
          isNull(monitoredDomains.removedAt),
          eq(monitoredDomains.paused, false),
        ))
        .limit(1),
    );

    if (!target?.gscSiteUrl) {
      return { ok: false, reason: "domain-not-ready" };
    }

    const { startDate, endDate } = rollingDateRange(28);
    const monthBucket = monthBucketUtc();

    const ok = await step.run("sync-domain", () =>
      syncOneDomain({
        domainId: target.domainId,
        userId: target.userId,
        siteUrl: target.gscSiteUrl!,
        startDate,
        endDate,
        monthBucket,
      }),
    );

    return { ok };
  },
);
