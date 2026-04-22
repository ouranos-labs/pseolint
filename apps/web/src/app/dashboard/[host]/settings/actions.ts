"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { requireSession } from "@/lib/session";

export async function updateDomainSettingsAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) throw new Error("missing domain host");

  const alertThresholdRaw = Number(formData.get("alertThreshold"));
  const alertThreshold = Number.isFinite(alertThresholdRaw) && alertThresholdRaw > 0 ? alertThresholdRaw : 10;
  const alertEmailRaw = String(formData.get("alertEmail") ?? "").trim();
  const alertEmail = alertEmailRaw.length ? alertEmailRaw : null;
  // GSC binding deferred to v1.2 — accept value from form but no-op for now.

  await db.update(monitoredDomains).set({ alertThreshold, alertEmail })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
}
