import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfiles } from "@/db/schema";

export async function getPlanForUser(userId: string): Promise<"free" | "pro"> {
  const [row] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (!row) return "free";
  if (row.plan === "pro" && row.planExpiresAt && row.planExpiresAt.getTime() < Date.now()) return "free";
  return row.plan;
}
