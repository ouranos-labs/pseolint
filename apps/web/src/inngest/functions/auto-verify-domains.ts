import { and, eq, gt, isNull, isNotNull } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { verifyDomainToken } from "@/lib/domain-verify";
import { auditLog } from "@/lib/audit-log";

/** How long after a domain is added we keep auto-polling its DNS for the
 *  verification record. After this window the user must click Verify
 *  manually — keeps cron work bounded. */
const AUTO_POLL_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Worst-case domains we'll re-check per tick. Tick is 5 min, so even at
 *  the cap we do < 1 DNS lookup per second amortized. */
const MAX_PER_TICK = 60;

export const autoVerifyDomains = inngest.createFunction(
  { id: "auto-verify-domains", retries: 2 },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const cutoff = new Date(Date.now() - AUTO_POLL_WINDOW_MS);
    const candidates = await step.run("fetch-candidates", async () =>
      db
        .select({
          id: monitoredDomains.id,
          host: monitoredDomains.host,
          token: monitoredDomains.verificationToken,
        })
        .from(monitoredDomains)
        .where(and(
          isNull(monitoredDomains.verifiedAt),
          isNull(monitoredDomains.removedAt),
          isNotNull(monitoredDomains.verificationToken),
          gt(monitoredDomains.createdAt, cutoff),
        ))
        .limit(MAX_PER_TICK),
    );

    let verified = 0;
    for (const c of candidates) {
      if (!c.token) continue;
      const ok = await step.run(`check-${c.id}`, async () => verifyDomainToken(c.host, c.token!));
      if (ok) {
        await step.run(`stamp-${c.id}`, async () => {
          await db
            .update(monitoredDomains)
            .set({ verifiedAt: new Date() })
            .where(eq(monitoredDomains.id, c.id));
        });
        verified++;
        auditLog("monitor.auto_verify.success", { domainId: c.id, host: c.host });
      }
    }

    return { checked: candidates.length, verified };
  },
);
