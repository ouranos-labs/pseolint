"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, domainDataSources, domainRuleOverrides, integrations } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { validateSlackWebhookUrl, sendSlackAlert } from "@/lib/slack-notify";
import { listSites, pickBestGscProperty } from "@/lib/gsc";
import { auditLog } from "@/lib/audit-log";
import { env } from "@/lib/env";

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

  // Gentle audit mode — when set, audits run with concurrency=2 + sample
  // capped to 200 so a fragile origin doesn't trip the engine's
  // BackpressureMonitor mid-crawl. HTML form checkboxes only submit when
  // checked, so a missing field means "off".
  const gentleAuditMode = String(formData.get("gentleAuditMode") ?? "") === "on";

  // Bring-your-own domain authority (0-100). Blank or out-of-range → null (unset
  // = engine applies no verdict shift). Integer-only to match the engine band.
  const authorityRaw = String(formData.get("authorityScore") ?? "").trim();
  const authorityNum = Number(authorityRaw);
  const authorityScore =
    authorityRaw.length > 0 && Number.isInteger(authorityNum) && authorityNum >= 0 && authorityNum <= 100
      ? authorityNum
      : null;

  // GSC property URL: empty string means "unbind". Light shape check —
  // real validation is the next sync run, which will fail loudly if the
  // URL isn't one of the user's GSC properties or perms were revoked.
  const gscSiteUrlRaw = String(formData.get("gscSiteUrl") ?? "").trim();
  const gscSiteUrl = gscSiteUrlRaw.length === 0
    ? null
    : (/^(sc-domain:|https?:\/\/)/.test(gscSiteUrlRaw) ? gscSiteUrlRaw : null);

  // Read the previous value so we can tell the redirect banner whether the
  // GSC binding changed (and how) without showing "saved!" for a no-op
  // submit. Same pattern as Polar's billing-portal redirects: feedback is
  // proportional to what actually changed.
  const [before] = await db
    .select({ gscSiteUrl: monitoredDomains.gscSiteUrl })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .limit(1);

  await db.update(monitoredDomains).set({ alertThreshold, alertEmail, gscSiteUrl, gentleAuditMode, authorityScore })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  auditLog("settings.domain.updated", {
    userId: session.user.id,
    host,
    gscChanged: (before?.gscSiteUrl ?? null) !== gscSiteUrl,
    gentleAuditMode,
  });
  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);

  // Redirect with a saved query so the page can render a transient banner
  // describing what changed. Encodes the gsc state machine separately
  // (bound/unbound/changed/unchanged) so the banner can show the bound
  // siteUrl when relevant.
  const prev = before?.gscSiteUrl ?? null;
  let gscState: "bound" | "rebound" | "unbound" | "unchanged";
  if (prev === gscSiteUrl) gscState = "unchanged";
  else if (gscSiteUrl == null) gscState = "unbound";
  else if (prev == null) gscState = "bound";
  else gscState = "rebound";

  const params = new URLSearchParams({ saved: "1", gsc: gscState });
  if (gscSiteUrl) params.set("siteUrl", gscSiteUrl);
  redirect(`/dashboard/${encodeURIComponent(host)}/settings?${params.toString()}`);
}

/**
 * Manual re-run of GSC auto-bind for a single domain. Used by the "Auto-bind
 * matching property" button on the per-domain settings page when a user
 * connects GSC AFTER adding the domain (so the OAuth-callback auto-bind
 * pass already happened without seeing this domain).
 */
export async function rebindGscPropertyAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) throw new Error("missing domain host");

  const [conn] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")))
    .limit(1);

  if (!conn) {
    auditLog("gsc.rebind.no_grant", { userId: session.user.id, host });
    redirect(`/dashboard/${encodeURIComponent(host)}/settings?gsc=no_grant`);
  }

  let pick: string | null = null;
  let err: string | null = null;
  try {
    const sites = await listSites(session.user.id);
    pick = pickBestGscProperty(sites, host);
  } catch (e) {
    err = e instanceof Error ? e.message : String(e);
  }

  if (err) {
    auditLog("gsc.rebind.failed", { userId: session.user.id, host, err });
    redirect(`/dashboard/${encodeURIComponent(host)}/settings?gsc=failed`);
  }

  if (!pick) {
    auditLog("gsc.rebind.no_match", { userId: session.user.id, host });
    redirect(`/dashboard/${encodeURIComponent(host)}/settings?gsc=no_match`);
  }

  await db.update(monitoredDomains)
    .set({ gscSiteUrl: pick })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  auditLog("gsc.rebind.bound", { userId: session.user.id, host, siteUrl: pick });
  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
  const params = new URLSearchParams({ saved: "1", gsc: "bound", siteUrl: pick });
  redirect(`/dashboard/${encodeURIComponent(host)}/settings?${params.toString()}`);
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

export async function updateSlackWebhookAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) throw new Error("missing domain host");

  const raw = String(formData.get("slackWebhookUrl") ?? "").trim();
  let webhookUrl: string | null;
  if (raw.length === 0) {
    webhookUrl = null;
  } else {
    const v = validateSlackWebhookUrl(raw);
    if (!v.ok) throw new Error(v.reason);
    webhookUrl = raw;
  }

  await db.update(monitoredDomains).set({ slackWebhookUrl: webhookUrl })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  auditLog("settings.slack.updated", { userId: session.user.id, host, configured: webhookUrl !== null });
  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
}

export async function testSlackWebhookAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) throw new Error("missing domain host");

  const [domain] = await db.select({
    id: monitoredDomains.id,
    sourceUrl: monitoredDomains.sourceUrl,
    slackWebhookUrl: monitoredDomains.slackWebhookUrl,
  })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .limit(1);
  if (!domain) throw new Error("not found");
  if (!domain.slackWebhookUrl) throw new Error("No webhook configured");

  try {
    await sendSlackAlert({
      webhookUrl: domain.slackWebhookUrl,
      sourceUrl: domain.sourceUrl,
      previousRisk: 10,
      currentRisk: 12,
      newRuleIds: ["meta/title-too-long"],
      reportSlug: "test-message",
      appUrl: env().BETTER_AUTH_URL,
    });
    auditLog("settings.slack.test_sent", { userId: session.user.id, host });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    auditLog("settings.slack.test_failed", { userId: session.user.id, host, err: msg });
    throw new Error(`Slack test failed: ${msg}`);
  }

  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
}

export async function updateIndexNowKeyAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) throw new Error("missing domain host");

  const rawKey = String(formData.get("indexNowKey") ?? "").trim();
  const indexNowKey = rawKey.length > 0 ? rawKey : null;

  await db.update(monitoredDomains).set({ indexNowKey })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  auditLog("settings.indexnow.updated", { userId: session.user.id, host, configured: indexNowKey !== null });
  revalidatePath(`/dashboard/${encodeURIComponent(host)}/settings`);
}
