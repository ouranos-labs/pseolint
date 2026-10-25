import { and, inArray, lt } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { encodeAuditFailure } from "@/lib/audit-failure";

/** A run older than this that is still queued/running is treated as lost. */
export const STUCK_AUDIT_AFTER_MS = 15 * 60 * 1000;

export const STUCK_AUDIT_MESSAGE = "Audit didn't finish within 15 minutes and was stopped.";

/**
 * Close audits a crashed worker, a dropped Inngest event or a deploy left
 * queued/running forever, so the progress page shows an honest "timeout"
 * instead of polling a spinner indefinitely (and so the stale row stops
 * counting against the caller's in-flight cap).
 *
 * The sweeper can't know which rate-limit counters the original request
 * bumped (the IP-keyed ones aren't derivable from the row), so it records the
 * failure as NOT refunded; the progress page then offers sign-in instead of a
 * "Try again" that would be refused.
 */
export async function sweepStuckAudits(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - STUCK_AUDIT_AFTER_MS);
  const swept = await db
    .update(audits)
    .set({
      status: "failed",
      errorMessage: encodeAuditFailure("timeout", STUCK_AUDIT_MESSAGE, { refunded: false }),
      completedAt: now,
    })
    .where(and(inArray(audits.status, ["queued", "running"]), lt(audits.createdAt, cutoff)))
    .returning({ id: audits.id });
  return swept.length;
}

export const sweepStuckAuditsFn = inngest.createFunction(
  { id: "sweep-stuck-audits" },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const swept = await step.run("sweep", () => sweepStuckAudits());
    return { swept };
  },
);
