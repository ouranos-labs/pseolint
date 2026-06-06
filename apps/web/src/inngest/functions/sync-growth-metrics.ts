/**
 * Weekly self-measurement sync — pulls pseolint.dev's OWN GSC property
 * (page+query) for the growth page-sets and upserts into growthSearchMetrics.
 * Distinct from sync-gsc.ts, which syncs customers' domains for the Pro audit.
 * No-ops unless GROWTH_GSC_* env is configured (see growthSyncOnce).
 */
import { inngest } from "@/lib/inngest";
import { growthSyncOnce } from "@/lib/growth-sync-core";

export const syncGrowthMetrics = inngest.createFunction(
  { id: "sync-growth-metrics", retries: 1 },
  { cron: "0 4 * * 1" }, // Mondays 04:00 UTC
  async ({ step }) => {
    return step.run("growth-sync", async () => growthSyncOnce());
  },
);
