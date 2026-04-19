import { lt } from "drizzle-orm";
import { inngest } from "@/lib/inngest";
import { db } from "@/db";
import { rateLimits } from "@/db/schema";

export const cleanupRateLimits = inngest.createFunction(
  { id: "cleanup-rate-limits" },
  { cron: "0 2 * * *" },
  async () => {
    const deleted = await db.delete(rateLimits).where(lt(rateLimits.expiresAt, new Date())).returning({ key: rateLimits.key });
    return { deleted: deleted.length };
  },
);
