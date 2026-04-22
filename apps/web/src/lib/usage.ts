import { db } from "@/db";
import { usageLog } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";

const FREE_AI_TRIAGE_MONTHLY = 1;

function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Atomic check-and-increment of monthly AI triage quota for a free user.
 * Returns { ok: true, remaining } on success, { ok: false, used } on quota hit.
 */
export async function reserveFreeTriageSlot(userId: string): Promise<
  | { ok: true; remaining: number }
  | { ok: false; used: number }
> {
  const month = currentMonth();
  const [row] = await db
    .insert(usageLog)
    .values({ userId, kind: "ai_triage", monthYyyymm: month, count: 1 })
    .onConflictDoUpdate({
      target: [usageLog.userId, usageLog.kind, usageLog.monthYyyymm],
      set: { count: sql`${usageLog.count} + 1`, updatedAt: new Date() },
      where: sql`${usageLog.count} < ${FREE_AI_TRIAGE_MONTHLY}`,
    })
    .returning({ count: usageLog.count });

  if (!row) {
    const [existing] = await db
      .select({ count: usageLog.count })
      .from(usageLog)
      .where(
        and(
          eq(usageLog.userId, userId),
          eq(usageLog.kind, "ai_triage"),
          eq(usageLog.monthYyyymm, month),
        ),
      )
      .limit(1);
    return { ok: false, used: existing?.count ?? FREE_AI_TRIAGE_MONTHLY };
  }

  return { ok: true, remaining: FREE_AI_TRIAGE_MONTHLY - row.count };
}
