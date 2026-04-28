"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, domainDataSources, domainRuleOverrides } from "@/db/schema";
import { requireSession } from "@/lib/session";

async function ownDomainId(userId: string, host: string): Promise<string | null> {
  const [row] = await db.select({ id: monitoredDomains.id })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, userId),
      isNull(monitoredDomains.removedAt),
    ))
    .limit(1);
  return row?.id ?? null;
}

export async function updateDomainSettingsAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) throw new Error("missing domain host");

  const alertThresholdRaw = Number(formData.get("alertThreshold"));
  const alertThreshold = Number.isFinite(alertThresholdRaw) && alertThresholdRaw > 0 ? alertThresholdRaw : 10;
  const alertEmailRaw = String(formData.get("alertEmail") ?? "").trim();
  const alertEmail = alertEmailRaw.length ? alertEmailRaw : null;

  // GSC property URL: empty string means "unbind". Light shape check —
  // real validation is the next sync run, which will fail loudly if the
  // URL isn't one of the user's GSC properties or perms were revoked.
  const gscSiteUrlRaw = String(formData.get("gscSiteUrl") ?? "").trim();
  const gscSiteUrl = gscSiteUrlRaw.length === 0
    ? null
    : (/^(sc-domain:|https?:\/\/)/.test(gscSiteUrlRaw) ? gscSiteUrlRaw : null);

  await db.update(monitoredDomains).set({ alertThreshold, alertEmail, gscSiteUrl })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
}

/** Accept a JSON blob of PageDataRecord[] and store it against the domain. */
export async function uploadDataSourceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  const json = String(formData.get("recordsJson") ?? "").trim();
  if (!host) throw new Error("missing domain host");
  if (!json) throw new Error("missing records JSON");

  let records: unknown;
  try { records = JSON.parse(json); } catch { throw new Error("invalid JSON"); }
  if (!Array.isArray(records)) throw new Error("expected a JSON array of records");
  // Cap to prevent storing huge blobs; 10k records is generous for v1.
  if (records.length > 10_000) throw new Error("too many records (max 10000)");

  const domainId = await ownDomainId(session.user.id, host);
  if (!domainId) throw new Error("not found");

  const serialized = JSON.stringify(records);
  await db.insert(domainDataSources).values({
    domainId, records: serialized, recordCount: records.length,
  }).onConflictDoUpdate({
    target: domainDataSources.domainId,
    set: { records: serialized, recordCount: records.length, updatedAt: new Date() },
  });

  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
}

export async function removeDataSourceAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) throw new Error("missing domain host");
  const domainId = await ownDomainId(session.user.id, host);
  if (!domainId) throw new Error("not found");
  await db.delete(domainDataSources).where(eq(domainDataSources.domainId, domainId));
  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
}

/** Accept JSON Partial<AuditOptions["rules"]> and store per-domain. */
export async function updateRuleOverridesAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  const json = String(formData.get("overridesJson") ?? "").trim();
  if (!host) throw new Error("missing domain host");

  const domainId = await ownDomainId(session.user.id, host);
  if (!domainId) throw new Error("not found");

  if (!json) {
    await db.delete(domainRuleOverrides).where(eq(domainRuleOverrides.domainId, domainId));
    revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
    return;
  }

  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new Error("invalid JSON"); }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("expected a JSON object");
  }

  const serialized = JSON.stringify(parsed);
  await db.insert(domainRuleOverrides).values({ domainId, overrides: serialized })
    .onConflictDoUpdate({
      target: domainRuleOverrides.domainId,
      set: { overrides: serialized, updatedAt: new Date() },
    });

  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
}
