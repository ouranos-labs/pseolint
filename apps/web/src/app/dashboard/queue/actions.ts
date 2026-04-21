"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { findingsState, monitoredDomains } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getRequiredSession } from "@/lib/session";

async function assertOwns(findingId: string): Promise<void> {
  const session = await getRequiredSession();
  const [row] = await db.select({ uid: monitoredDomains.userId })
    .from(findingsState)
    .innerJoin(monitoredDomains, eq(findingsState.domainId, monitoredDomains.id))
    .where(eq(findingsState.id, findingId))
    .limit(1);
  if (!row || row.uid !== session.user.id) throw new Error("not found");
}

export async function snoozeFinding(findingId: string, days: number): Promise<void> {
  await assertOwns(findingId);
  const until = new Date(Date.now() + days * 86_400_000);
  await db.update(findingsState).set({ status: "snoozed", snoozeUntil: until }).where(eq(findingsState.id, findingId));
  revalidatePath("/dashboard/queue");
}

export async function dismissFinding(findingId: string): Promise<void> {
  await assertOwns(findingId);
  await db.update(findingsState).set({ status: "dismissed" }).where(eq(findingsState.id, findingId));
  revalidatePath("/dashboard/queue");
}
