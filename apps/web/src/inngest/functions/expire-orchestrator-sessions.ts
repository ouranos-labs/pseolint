import { and, eq, lt, isNotNull } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { fixManifests, orchestratorSessions } from "@/db/schema";
import { deleteReport } from "@/lib/r2";

/**
 * Daily sweep that retires expired manifests + their R2 blobs (the
 * NDJSON event log + the manifest JSON). Mirrors the `expire-reports`
 * function for v0.4 audits.
 *
 * Sessions themselves aren't deleted: the rows stay so the Pro cost
 * dashboard can still aggregate historical spend. Only the R2 artifacts
 * (typically 100KB-2MB each) get cleaned up to keep storage bounded.
 */
export const expireOrchestratorSessions = inngest.createFunction(
  { id: "expire-orchestrator-sessions" },
  { cron: "0 4 * * *" },
  async ({ step }) => {
    const now = new Date();
    const expired = await step.run("find-expired", async () =>
      db
        .select({
          id: fixManifests.id,
          sessionId: fixManifests.sessionId,
          manifestKey: fixManifests.manifestKey,
        })
        .from(fixManifests)
        .where(and(lt(fixManifests.expiresAt, now), isNotNull(fixManifests.manifestKey)))
        .limit(500),
    );

    let cleaned = 0;
    for (const row of expired) {
      const sessionLogKey = `orchestrator/${row.sessionId}/log.ndjson`;
      await step.run(`delete-${row.id}`, async () => {
        // Best-effort R2 cleanup: failures here are non-fatal because the
        // bucket may already have purged or the key may never have been
        // written (very early failures).
        try {
          await deleteReport(row.manifestKey);
        } catch {
          /* gone */
        }
        try {
          await deleteReport(sessionLogKey);
        } catch {
          /* gone */
        }
        await db
          .update(orchestratorSessions)
          .set({ logKey: null })
          .where(eq(orchestratorSessions.id, row.sessionId));
      });
      cleaned += 1;
    }

    return { cleaned };
  },
);
