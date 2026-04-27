import { and, eq, lt, isNotNull } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { deleteReport } from "@/lib/r2";

export const expireReports = inngest.createFunction(
  { id: "expire-reports" },
  { cron: "0 3 * * *" },
  async ({ step }) => {
    const now = new Date();
    const expired = await step.run("find-expired", async () =>
      db.select({ id: audits.id, storageKey: audits.storageKey })
        .from(audits)
        .where(and(lt(audits.expiresAt, now), isNotNull(audits.storageKey)))
        .limit(500)
    );

    for (const row of expired) {
      if (!row.storageKey) continue;
      const key = row.storageKey;
      const sibling = key.endsWith(".json")
        ? key.replace(/\.json$/, ".html")
        : key.replace(/\.html$/, ".json");
      await step.run(`delete-${row.id}`, async () => {
        try { await deleteReport(key); } catch { /* already gone */ }
        try { await deleteReport(sibling); } catch { /* best-effort */ }
        await db.update(audits).set({ status: "expired", storageKey: null }).where(eq(audits.id, row.id));
      });
    }

    return { expired: expired.length };
  },
);
