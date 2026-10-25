"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, domainDataSources, domainRuleOverrides, integrations } from "@/db/schema";
import { parseScanOptions } from "@/lib/scan-options";
import { requireSession } from "@/lib/session";
import { validateSlackWebhookUrl, sendSlackAlert } from "@/lib/slack-notify";
import { listSites, pickBestGscProperty } from "@/lib/gsc";
import { auditLog } from "@/lib/audit-log";
import { env } from "@/lib/env";
import { type ActionResult, NOTHING_SAVED, isPlausibleEmail, jsonErrorMessage } from "@/lib/action-result";

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

/**
 * Read the GSC property field. The three outcomes are deliberately distinct:
 *  - absent (the <select> wasn't rendered, e.g. Google was unreachable or GSC
 *    isn't connected) → leave the binding alone;
 *  - an explicit empty selection → unbind;
 *  - a property URL → bind it.
 * Treating "absent" as "unbind" is what used to silently drop a Search Console
 * binding whenever someone saved an alert threshold while Google was down.
 */
type GscFieldValue =
  | { kind: "unchanged" }
  | { kind: "set"; value: string | null }
  | { kind: "invalid" };

function readGscSiteUrlField(entry: FormDataEntryValue | null): GscFieldValue {
  if (entry === null) return { kind: "unchanged" };
  const raw = String(entry).trim();
  if (raw.length === 0) return { kind: "set", value: null };
  // Light shape check; the next sync run is the real validation and fails
  // loudly if the URL isn't one of the user's properties or perms were revoked.
  return /^(sc-domain:|https?:\/\/)/.test(raw) ? { kind: "set", value: raw } : { kind: "invalid" };
}

const FORM_BROKEN: ActionResult = {
  ok: false,
  error: "This form is missing its domain. Reload the page and try again.",
};
const DOMAIN_GONE: ActionResult = {
  ok: false,
  error: "This domain is no longer in your workspace. Reload the page.",
};

export async function updateDomainSettingsAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) return FORM_BROKEN;

  // Validate everything before writing anything, and say which field failed
  // instead of quietly substituting a default.
  const alertThresholdRaw = String(formData.get("alertThreshold") ?? "").trim();
  const alertThreshold = Number(alertThresholdRaw);
  if (!alertThresholdRaw || !Number.isInteger(alertThreshold) || alertThreshold < 1) {
    return { ok: false, field: "alertThreshold", error: `Alert threshold must be a whole number of 1 or more. ${NOTHING_SAVED}` };
  }
  const alertEmailRaw = String(formData.get("alertEmail") ?? "").trim();
  if (alertEmailRaw && !isPlausibleEmail(alertEmailRaw)) {
    return { ok: false, field: "alertEmail", error: `"${alertEmailRaw}" isn't a valid email address. ${NOTHING_SAVED}` };
  }
  const alertEmail = alertEmailRaw.length ? alertEmailRaw : null;

  // Gentle audit mode: when set, audits run with concurrency=2 + sample
  // capped to 200 so a fragile origin doesn't trip the engine's
  // BackpressureMonitor mid-crawl. HTML form checkboxes only submit when
  // checked, so a missing field means "off".
  const gentleAuditMode = String(formData.get("gentleAuditMode") ?? "") === "on";
  // Render JS-heavy pages in a headless browser before auditing (needs the
  // PSEOLINT_BROWSER_WS endpoint configured; no-ops without it).
  const renderMode = String(formData.get("renderMode") ?? "") === "on";

  // Bring-your-own domain authority (0-100). Blank → null (unset = engine
  // applies no verdict shift). Integer-only to match the engine band.
  const authorityRaw = String(formData.get("authorityScore") ?? "").trim();
  const authorityNum = Number(authorityRaw);
  if (authorityRaw.length > 0 && !(Number.isInteger(authorityNum) && authorityNum >= 0 && authorityNum <= 100)) {
    return { ok: false, field: "authorityScore", error: `Domain authority must be a whole number from 0 to 100, or blank. ${NOTHING_SAVED}` };
  }
  const authorityScore = authorityRaw.length > 0 ? authorityNum : null;

  const gsc = readGscSiteUrlField(formData.get("gscSiteUrl"));
  if (gsc.kind === "invalid") {
    return { ok: false, field: "gscSiteUrl", error: `That isn't a Search Console property URL. ${NOTHING_SAVED}` };
  }

  // Read the previous value so the confirmation can say whether the GSC
  // binding changed (and how) without announcing a change on a no-op submit.
  const [before] = await db
    .select({ gscSiteUrl: monitoredDomains.gscSiteUrl })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .limit(1);
  if (!before) return DOMAIN_GONE;

  const prev = before.gscSiteUrl ?? null;
  const next = gsc.kind === "set" ? gsc.value : prev;

  await db.update(monitoredDomains)
    .set({
      alertThreshold, alertEmail, gentleAuditMode, authorityScore, renderMode,
      ...(gsc.kind === "set" && { gscSiteUrl: gsc.value }),
    })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  auditLog("settings.domain.updated", {
    userId: session.user.id,
    host,
    gscChanged: prev !== next,
    gentleAuditMode,
  });
  revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");

  // Feedback proportional to what changed: name the bound property when the
  // binding moved, otherwise a plain confirmation.
  let message = "Settings saved.";
  if (prev !== next) {
    if (next == null) message = "Settings saved. Search Console property unbound; findings rank by severity until you bind one again.";
    else if (prev == null) message = `Settings saved. Bound to ${next}; findings rank by traffic-at-risk after the next sync (about 24h).`;
    else message = `Settings saved. Re-bound to ${next}.`;
  }
  return { ok: true, message };
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
  revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
  const params = new URLSearchParams({ saved: "1", gsc: "bound", siteUrl: pick });
  redirect(`/dashboard/${encodeURIComponent(host)}/settings?${params.toString()}`);
}

/** Accept a JSON blob of PageDataRecord[] and store it against the domain. */
export async function uploadDataSourceAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  const json = String(formData.get("recordsJson") ?? "").trim();
  if (!host) return FORM_BROKEN;
  if (!json) return { ok: false, field: "recordsJson", error: "Choose a file or paste JSON." };

  let records: unknown;
  try { records = JSON.parse(json); } catch (e) {
    return { ok: false, field: "recordsJson", error: jsonErrorMessage("The dataset", json, e) };
  }
  if (!Array.isArray(records)) {
    return { ok: false, field: "recordsJson", error: `The dataset must be a JSON array of records. ${NOTHING_SAVED}` };
  }
  // Cap to prevent storing huge blobs; 10k records is generous for v1.
  if (records.length > 10_000) {
    return { ok: false, field: "recordsJson", error: `The dataset has ${records.length} records; the limit is 10,000. ${NOTHING_SAVED}` };
  }

  const domainId = await ownDomainId(session.user.id, host);
  if (!domainId) return DOMAIN_GONE;

  const serialized = JSON.stringify(records);
  await db.insert(domainDataSources).values({
    domainId, records: serialized, recordCount: records.length,
  }).onConflictDoUpdate({
    target: domainDataSources.domainId,
    set: { records: serialized, recordCount: records.length, updatedAt: new Date() },
  });

  revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
  return { ok: true, message: `Dataset saved (${records.length} record${records.length === 1 ? "" : "s"}).` };
}

export async function removeDataSourceAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) return FORM_BROKEN;
  const domainId = await ownDomainId(session.user.id, host);
  if (!domainId) return DOMAIN_GONE;
  await db.delete(domainDataSources).where(eq(domainDataSources.domainId, domainId));
  revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
  return { ok: true, message: "Dataset removed." };
}

/** Accept JSON Partial<AuditOptions["rules"]> and store per-domain. */
export async function updateRuleOverridesAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  const json = String(formData.get("overridesJson") ?? "").trim();
  if (!host) return FORM_BROKEN;

  const domainId = await ownDomainId(session.user.id, host);
  if (!domainId) return DOMAIN_GONE;

  if (!json) {
    await db.delete(domainRuleOverrides).where(eq(domainRuleOverrides.domainId, domainId));
    revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
    return { ok: true, message: "Rule overrides cleared. Default thresholds apply from the next audit." };
  }

  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch (e) {
    return { ok: false, field: "overridesJson", error: jsonErrorMessage("Rule thresholds", json, e) };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, field: "overridesJson", error: `Rule thresholds must be a JSON object, like {"thinContentMinWords": 150}. ${NOTHING_SAVED}` };
  }

  const serialized = JSON.stringify(parsed);
  await db.insert(domainRuleOverrides).values({ domainId, overrides: serialized })
    .onConflictDoUpdate({
      target: domainRuleOverrides.domainId,
      set: { overrides: serialized, updatedAt: new Date() },
    });

  revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
  return { ok: true, message: "Rule overrides saved. They apply from the next audit." };
}

export async function updateSlackWebhookAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) return FORM_BROKEN;

  const raw = String(formData.get("slackWebhookUrl") ?? "").trim();
  let webhookUrl: string | null;
  if (raw.length === 0) {
    webhookUrl = null;
  } else {
    const v = validateSlackWebhookUrl(raw);
    if (!v.ok) {
      const why = v.reason.startsWith("must") ? `The webhook URL ${v.reason}.` : "The webhook URL is malformed.";
      return { ok: false, field: "slackWebhookUrl", error: `${why} ${NOTHING_SAVED}` };
    }
    webhookUrl = raw;
  }

  const updated = await db.update(monitoredDomains).set({ slackWebhookUrl: webhookUrl })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .returning({ id: monitoredDomains.id });
  if (updated.length === 0) return DOMAIN_GONE;

  auditLog("settings.slack.updated", { userId: session.user.id, host, configured: webhookUrl !== null });
  revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
  return { ok: true, message: webhookUrl ? "Webhook saved." : "Webhook removed. Slack alerts are off for this domain." };
}

export async function testSlackWebhookAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) return FORM_BROKEN;

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
  if (!domain) return DOMAIN_GONE;
  if (!domain.slackWebhookUrl) return { ok: false, error: "No webhook is saved yet. Save one above, then send a test." };

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
    return { ok: false, error: `Slack didn't accept the test message (${msg}). Check the webhook URL and that the channel still exists.` };
  }

  return { ok: true, message: "Test message sent to Slack." };
}

export async function updateIndexNowKeyAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) return FORM_BROKEN;

  const rawKey = String(formData.get("indexNowKey") ?? "").trim();
  const indexNowKey = rawKey.length > 0 ? rawKey : null;

  const updated = await db.update(monitoredDomains).set({ indexNowKey })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .returning({ id: monitoredDomains.id });
  if (updated.length === 0) return DOMAIN_GONE;

  auditLog("settings.indexnow.updated", { userId: session.user.id, host, configured: indexNowKey !== null });
  revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
  return { ok: true, message: indexNowKey ? "IndexNow key saved." : "IndexNow key removed." };
}

/**
 * Assemble the "Advanced scan options" form (friendly knobs + two JSON
 * textareas) into ONE object, validate it through the allowlist
 * (`parseScanOptions`), and persist the JSON to `monitoredDomains.scanOptions`.
 *
 * SECURITY: this never trusts the form. Everything is funneled through
 * `parseScanOptions`, whose `.strict()` schema accepts ONLY the 7 safe knobs:
 * no safeMode / SSRF / robots / cache / render / ai / authority lever can be
 * smuggled in here. An empty/all-default submission clears the column.
 */
export async function updateScanOptionsAction(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const host = String(formData.get("domainHost") ?? "");
  if (!host) return FORM_BROKEN;

  const domainId = await ownDomainId(session.user.id, host);
  if (!domainId) return DOMAIN_GONE;

  // Friendly knobs. Checkboxes only submit when checked, so absence = off; we
  // only set a boolean key when the box is checked (true) so "everything off"
  // collapses to no stored options rather than a row full of `false`.
  const raw: Record<string, unknown> = {};
  if (String(formData.get("crawlDiscovery") ?? "") === "on") raw.crawlDiscovery = true;
  if (String(formData.get("fillBudgetViaLinkDiscovery") ?? "") === "on") raw.fillBudgetViaLinkDiscovery = true;
  if (String(formData.get("strict") ?? "") === "on") raw.strict = true;

  const sampling = String(formData.get("samplingStrategy") ?? "").trim();
  if (sampling === "stratified" || sampling === "random") raw.samplingStrategy = sampling;

  const maxPerTemplateRaw = String(formData.get("maxPerTemplate") ?? "").trim();
  if (maxPerTemplateRaw.length > 0) {
    const n = Number(maxPerTemplateRaw);
    if (!Number.isInteger(n) || n < 1) {
      return { ok: false, field: "maxPerTemplate", error: `Max samples per template must be a whole number of 1 or more, or blank. ${NOTHING_SAVED}` };
    }
    raw.maxPerTemplate = n;
  }

  // Two advanced JSON textareas. Parse each independently so we can point the
  // user at the exact field (and line) that failed.
  const pageGroupsJson = String(formData.get("pageGroupsJson") ?? "").trim();
  if (pageGroupsJson.length > 0) {
    try { raw.pageGroups = JSON.parse(pageGroupsJson); }
    catch (e) { return { ok: false, field: "pageGroupsJson", error: jsonErrorMessage("Page groups", pageGroupsJson, e) }; }
  }
  const entityPatternsJson = String(formData.get("entityPatternsJson") ?? "").trim();
  if (entityPatternsJson.length > 0) {
    try { raw.entityPatterns = JSON.parse(entityPatternsJson); }
    catch (e) { return { ok: false, field: "entityPatternsJson", error: jsonErrorMessage("Entity patterns", entityPatternsJson, e) }; }
  }

  // Nothing set → clear the column (back to engine defaults).
  if (Object.keys(raw).length === 0) {
    await db.update(monitoredDomains).set({ scanOptions: null })
      .where(and(
        eq(monitoredDomains.host, host),
        eq(monitoredDomains.userId, session.user.id),
        isNull(monitoredDomains.removedAt),
      ));
    auditLog("settings.scan_options.updated", { userId: session.user.id, host, configured: false });
    revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
    return { ok: true, message: "Scan options reset to the standard crawl." };
  }

  // The allowlist is the gate. Anything outside the 7 safe fields, or a bad
  // shape/type, fails here; we reject rather than silently strip so the user
  // knows their input didn't take. The simple knobs were checked above, so a
  // failure here is one of the JSON fields: find which, to point at it.
  const validated = parseScanOptions(raw);
  if (!validated) {
    if (raw.pageGroups !== undefined && parseScanOptions({ pageGroups: raw.pageGroups }) === null) {
      return { ok: false, field: "pageGroupsJson", error: `Page groups don't match the expected shape: a map of names to { match, rules?, overrides? }. ${NOTHING_SAVED}` };
    }
    if (raw.entityPatterns !== undefined && parseScanOptions({ entityPatterns: raw.entityPatterns }) === null) {
      return { ok: false, field: "entityPatternsJson", error: `Entity patterns don't match the expected shape: an array of { placeholder, pattern, flags? }. ${NOTHING_SAVED}` };
    }
    return { ok: false, error: `These scan options couldn't be validated. ${NOTHING_SAVED}` };
  }

  await db.update(monitoredDomains).set({ scanOptions: JSON.stringify(validated) })
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ));

  auditLog("settings.scan_options.updated", { userId: session.user.id, host, configured: true });
  revalidatePath(`/dashboard/${encodeURIComponent(host)}`, "layout");
  return { ok: true, message: "Scan options saved. They apply from the next audit." };
}
