import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { users, userProfiles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { sendWeeklyDigestTo } from "@/lib/digest-email";

export const weeklyDigest = inngest.createFunction(
  { id: "weekly-digest", retries: 1 },
  { cron: "0 6 * * 1" }, // Monday 06:00 UTC
  async ({ step }) => {
    const rows = await step.run("fetch-pro-users", async () =>
      db.select({ userId: users.id, email: users.email })
        .from(users)
        .innerJoin(userProfiles, and(eq(userProfiles.userId, users.id), eq(userProfiles.plan, "pro"))),
    );
    for (const r of rows) {
      await step.run(`digest-${r.userId}`, async () => sendWeeklyDigestTo(r.userId, r.email));
    }
    return { sent: rows.length };
  },
);
