"use server";
import { revalidatePath } from "next/cache";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits, watchedPages } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { publicSlug } from "@/lib/slug";
import { assertSafeUrl } from "@/lib/ssrf";
import { inngest } from "@/lib/inngest";
import { MAX_PRO_DOMAINS } from "@/lib/tier-limits";
import { PRO_REAUDIT_SAMPLE_SIZE, WATCHED_PAGES_CAP } from "@/lib/audit-limits";
import { assertProAuditAllowed } from "@/lib/audit-gate";
import { generateVerificationToken, verifyDomainToken } from "@/lib/domain-verify";
import { devFlags } from "@/lib/dev-flags";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { getPlan } from "@/lib/plan";
import { auditLog } from "@/lib/audit-log";
import { loadWatchedUrlsForDomain } from "@/lib/monitoring";
import { listSites, pickBestGscProperty, provesGscOwnership } from "@/lib/gsc";
import { integrations } from "@/db/schema";

/**
 * Strip a leading "www." for case-insensitive host comparison. Watched URLs
 * must belong to the monitored domain: but `www.example.com` and
 * `example.com` are routinely the same site, so we treat them as equivalent.
 */
function canonicalHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function originOf(rawUrl: string): { host: string; origin: string } {
  const u = new URL(rawUrl);
  return { host: u.host, origin: `${u.protocol}//${u.host}` };
}

/**
 * Enqueue an audit job, converting an Inngest failure into a graceful result
 * instead of an uncaught throw. A bare `await inngest.send(...)` in a server
 * action rejects the action → HTTP 500 (and leaves the just-inserted `queued`
 * audit row orphaned forever). On failure we mark that row `failed` so it
 * doesn't sit as a perpetual "queued", and return false so callers can decide
 * whether the enqueue was essential (re-audit) or best-effort (first add).
 */
type AuditRequestData = {
  url: string;
  plan: "free" | "pro";
  sampleSize: number;
  render?: boolean;
  mode?: "full" | "diff";
  force?: { urls?: string[] };
};

async function enqueueAudit(
  auditId: string,
  data: AuditRequestData,
  ctx: { userId: string; host: string },
): Promise<boolean> {
  try {
    await inngest.send({ name: "audit/requested", data: { auditId, ...data } });
    return true;
  } catch (e) {
    auditLog("audit.enqueue.failed", { auditId, userId: ctx.userId, host: ctx.host, err: e instanceof Error ? e.message : String(e) });
    await db.update(audits)
      .set({ status: "failed", errorMessage: "Failed to queue audit job" })
      .where(eq(audits.id, auditId))
      .catch(() => { /* row-mark is best-effort; the return value is the signal */ });
    return false;
  }
}

/**
 * Add a domain to monitoring. `auditId` is null when the domain still needs an
 * ownership proof: no audit is queued in that case, so callers should send the
 * user to the workspace (where the verify banner lives) rather than to a live
 * audit page.
 */
export async function addDomainAction(
  rawUrl: string,
): Promise<{ ok: true; host: string; auditId: string | null } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const normalized = normalizeUserUrl(rawUrl);
  if (!normalized) return { ok: false, error: "Enter a valid URL (e.g. example.com or https://example.com)." };

  try {
    await assertSafeUrl(normalized);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid URL" };
  }

  const { host, origin } = originOf(normalized);

  const [existing] = await db
    .select({ removedAt: monitoredDomains.removedAt })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, session.user.id), eq(monitoredDomains.host, host)))
    .limit(1);

  if (existing) {
    if (existing.removedAt) {
      const [{ active }] = await db
        .select({ active: sql<number>`count(*)::int` })
        .from(monitoredDomains)
        .where(and(eq(monitoredDomains.userId, session.user.id), isNull(monitoredDomains.removedAt)));
      if (active >= MAX_PRO_DOMAINS) {
        return { ok: false, error: `Pro is capped at ${MAX_PRO_DOMAINS} active monitored domains. Remove one first, or email support for a higher limit.` };
      }
      // Reactivate a soft-deleted row. Issue a fresh verification token + clear
      // verifiedAt: ownership must be re-proven each time a domain is re-added.
      await db.update(monitoredDomains)
        .set({
          removedAt: null,
          sourceUrl: origin,
          verificationToken: generateVerificationToken(),
          verifiedAt: devFlags.domainVerifySkipped ? new Date() : null,
        })
        .where(and(eq(monitoredDomains.userId, session.user.id), eq(monitoredDomains.host, host)));
    }
  } else {
    const [{ active }] = await db
      .select({ active: sql<number>`count(*)::int` })
      .from(monitoredDomains)
      .where(and(eq(monitoredDomains.userId, session.user.id), isNull(monitoredDomains.removedAt)));
    if (active >= MAX_PRO_DOMAINS) {
      return { ok: false, error: `Pro is capped at ${MAX_PRO_DOMAINS} active monitored domains. Remove one first, or email support for a higher limit.` };
    }
    await db.insert(monitoredDomains).values({
      slug: publicSlug(), userId: session.user.id, sourceUrl: origin, host,
      cadence: "daily", nextRunAt: new Date(),
      verificationToken: generateVerificationToken(),
      ...(devFlags.domainVerifySkipped && { verifiedAt: new Date() }),
    });
  }

  const [domRow] = await db
    .select({
      id: monitoredDomains.id,
      gscSiteUrl: monitoredDomains.gscSiteUrl,
      verifiedAt: monitoredDomains.verifiedAt,
    })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, session.user.id), eq(monitoredDomains.host, host)))
    .limit(1);
  let verified = Boolean(domRow?.verifiedAt);

  // Auto-bind the matching GSC property if the user already granted us
  // Search Console access. Best-effort: a failure (revoked perms,
  // network) leaves the domain unbound and the per-host settings page
  // surfaces a suggestion instead.
  //
  // A matched owner-or-full property is also a valid ownership proof (see
  // `provesGscOwnership`), so it verifies the domain outright: Pro users who
  // already connected Search Console never touch a TXT record.
  if (domRow && !domRow.gscSiteUrl) {
    const [conn] = await db
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")))
      .limit(1);
    if (conn) {
      try {
        const sites = await listSites(session.user.id);
        const pick = pickBestGscProperty(sites, host);
        if (pick) {
          const entry = sites.find((s) => s.siteUrl === pick);
          const verifies = !verified && entry != null && provesGscOwnership(entry);
          await db.update(monitoredDomains)
            .set({ gscSiteUrl: pick, ...(verifies && { verifiedAt: new Date() }) })
            .where(eq(monitoredDomains.id, domRow.id));
          if (verifies) {
            verified = true;
            auditLog("monitor.verified.via_gsc", { userId: session.user.id, host, siteUrl: pick });
          }
          auditLog("gsc.autobind.on_add", { userId: session.user.id, host, siteUrl: pick });
        } else {
          auditLog("gsc.autobind.on_add.no_match", { userId: session.user.id, host });
        }
      } catch (e) {
        auditLog("gsc.autobind.on_add.failed", {
          userId: session.user.id,
          host,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // Ownership gate: an unverified domain gets no crawl at all, not even a
  // one-off kickoff. The row is already saved with `nextRunAt` due, so
  // monitor-domains audits it on the first hourly tick after
  // verifyDomainAction / autoVerifyDomains stamps `verifiedAt`.
  //
  // This is also what bounds abuse on this path: you can only make us crawl a
  // host you have proven you control, which is a stronger guarantee than the
  // rate caps in `assertProAuditAllowed` could give.
  //
  // ponytail: the cron is already the mechanism, so no kickoff audit is fired
  // at verify time either. Add one there if the sub-1h wait for the first
  // report ever becomes a complaint.
  if (!domRow || !verified) {
    auditLog("monitor.add.awaiting_verification", { userId: session.user.id, host });
    return { ok: true, host, auditId: null };
  }

  const auditSlug = publicSlug();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const [audit] = await db.insert(audits).values({
    slug: auditSlug, userId: session.user.id, sourceUrl: origin,
    status: "queued", expiresAt, isPublic: false,
  }).returning({ id: audits.id });

  // A re-added domain can already carry a watched-pages list, so forward it and
  // let the kickoff run force-refetch those URLs. Empty on a brand-new domain.
  const watchedUrls = await loadWatchedUrlsForDomain(domRow.id);

  // Best-effort kickoff: the domain is already saved and the cron will audit it
  // regardless, so an enqueue failure must NOT fail the add (or 500).
  await enqueueAudit(
    audit.id,
    { url: origin, plan: "pro", sampleSize: PRO_REAUDIT_SAMPLE_SIZE, mode: "full", ...(watchedUrls.length > 0 && { force: { urls: watchedUrls } }) },
    { userId: session.user.id, host },
  );

  return { ok: true, host, auditId: audit.id };
}

export async function removeDomainAction(
  domainHost: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const res = await db.update(monitoredDomains)
    .set({ removedAt: new Date() })
    .where(and(
      eq(monitoredDomains.host, domainHost),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .returning({ id: monitoredDomains.id });

  if (!res.length) return { ok: false, error: "not found" };

  // v0.5.3: domain removal is soft (sets removedAt), so the FK cascade on
  // watched_page never fires. Drop the watched list explicitly so a future
  // re-add doesn't resurrect stale URLs.
  await db.delete(watchedPages).where(eq(watchedPages.monitoredDomainId, res[0].id));

  return { ok: true };
}

export async function reAuditNowAction(
  domainHost: string,
): Promise<{ ok: true; auditId: string } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const [dom] = await db.select({
    id: monitoredDomains.id,
    sourceUrl: monitoredDomains.sourceUrl,
    verifiedAt: monitoredDomains.verifiedAt,
  })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, domainHost),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1);
  if (!dom) return { ok: false, error: "not found" };
  if (!dom.verifiedAt) return { ok: false, error: "Verify domain ownership first (see workspace header)." };

  const auditSlug = publicSlug();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const [audit] = await db.insert(audits).values({
    slug: auditSlug, userId: session.user.id, sourceUrl: dom.sourceUrl,
    status: "queued", expiresAt, isPublic: false,
  }).returning({ id: audits.id });

  // v0.5.3: thread per-domain watched URLs into the audit so manual re-audits
  // always re-fetch them, not just weekly cron runs.
  const watchedUrls = await loadWatchedUrlsForDomain(dom.id);

  // Re-audit's whole point is to run now: a failed enqueue must surface as an
  // error (and mark the orphaned row failed), not 500 or falsely report success.
  const queued = await enqueueAudit(
    audit.id,
    { url: dom.sourceUrl, plan: "pro", sampleSize: PRO_REAUDIT_SAMPLE_SIZE, mode: "full", ...(watchedUrls.length > 0 && { force: { urls: watchedUrls } }) },
    { userId: session.user.id, host: domainHost },
  );
  if (!queued) return { ok: false, error: "Couldn't queue the audit, please try again in a moment." };

  return { ok: true, auditId: audit.id };
}

/**
 * Resolve the DNS TXT record for `_pseolint-verify.<host>` and mark the domain
 * verified if it matches the stored token. Returns a discriminated result with
 * helpful copy for the UI on failure.
 */
export async function verifyDomainAction(
  domainHost: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const [dom] = await db.select({
    id: monitoredDomains.id,
    host: monitoredDomains.host,
    verificationToken: monitoredDomains.verificationToken,
    verifiedAt: monitoredDomains.verifiedAt,
  })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, domainHost),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1);
  if (!dom) return { ok: false, error: "not found" };
  if (dom.verifiedAt) return { ok: true };
  if (!dom.verificationToken) {
    // Legacy row (pre-migration): issue a token now so the user can verify.
    await db.update(monitoredDomains)
      .set({ verificationToken: generateVerificationToken() })
      .where(eq(monitoredDomains.id, dom.id));
    return { ok: false, error: "Verification token issued, retry in a moment after publishing the TXT record." };
  }

  const ok = await verifyDomainToken(dom.host, dom.verificationToken);
  if (!ok) {
    return { ok: false, error: `No matching TXT record found at _pseolint-verify.${dom.host}. DNS propagation can take a few minutes.` };
  }

  await db.update(monitoredDomains)
    .set({ verifiedAt: new Date() })
    .where(eq(monitoredDomains.id, dom.id));

  return { ok: true };
}

/**
 * v0.5.3: pin a URL to a domain's watched-pages list. Pro-only; cap of 20
 * per domain. Validates that the URL parses, passes the SSRF guard, and
 * matches the monitored domain's host (www-equivalent). On insert, fires an
 * `audit/requested` Inngest event for the domain's source URL with
 * `force: { urls: [<watchedUrl>] }` so the page is audited immediately rather
 * than waiting for the next monitoring tick.
 */
export async function addWatchedPage(
  monitoredDomainId: string,
  rawUrl: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  // Pro gate.
  const plan = await getPlan(session.user.id);
  if (plan !== "pro") return { ok: false, error: "Watched pages are a Pro feature." };

  // Ownership + active-row check.
  const [dom] = await db.select({
    id: monitoredDomains.id,
    host: monitoredDomains.host,
    sourceUrl: monitoredDomains.sourceUrl,
    verifiedAt: monitoredDomains.verifiedAt,
  })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.id, monitoredDomainId),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .limit(1);
  if (!dom) return { ok: false, error: "not found" };

  // Pinning a page schedules recurring fetches of it (and fires one below), so
  // it needs the same ownership proof the monitoring cron demands.
  if (!dom.verifiedAt) {
    return { ok: false, error: "Verify domain ownership first (see workspace header)." };
  }

  // Normalise + validate.
  const normalized = normalizeUserUrl(rawUrl);
  if (!normalized) return { ok: false, error: "Enter a valid URL." };

  let parsed: URL;
  try { parsed = new URL(normalized); } catch { return { ok: false, error: "Enter a valid URL." }; }

  if (canonicalHost(parsed.host) !== canonicalHost(dom.host)) {
    return { ok: false, error: `URL must belong to ${dom.host}.` };
  }

  try {
    await assertSafeUrl(normalized);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "URL failed safety check." };
  }

  // Atomic cap-enforcement: SELECT FOR UPDATE on the parent monitored_domain
  // row serializes concurrent adds for the same domain. Without the lock, two
  // simultaneous calls could both observe count=19 and both insert, landing at
  // 21 rows. The unique index on (monitoredDomainId, url) handles duplicate
  // detection inside the lock; the lock handles the count+insert race.
  const cap = WATCHED_PAGES_CAP.pro;
  try {
    const inserted = await db.transaction(async (tx) => {
      // Acquire row lock; result discarded; we only need the side effect.
      await tx
        .select({ id: monitoredDomains.id })
        .from(monitoredDomains)
        .where(eq(monitoredDomains.id, dom.id))
        .for("update");

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(watchedPages)
        .where(eq(watchedPages.monitoredDomainId, dom.id));
      if (count >= cap) {
        return { kind: "cap" as const };
      }
      const [row] = await tx
        .insert(watchedPages)
        .values({
          monitoredDomainId: dom.id,
          url: normalized,
          addedByUserId: session!.user.id,
        })
        .onConflictDoNothing({ target: [watchedPages.monitoredDomainId, watchedPages.url] })
        .returning({ id: watchedPages.id });
      if (!row) return { kind: "duplicate" as const };
      return { kind: "ok" as const, id: row.id };
    });

    if (inserted.kind === "cap") {
      auditLog("watched_page.cap_reached", { userId: session.user.id, monitoredDomainId: dom.id, host: dom.host });
      return { ok: false, error: `Pro is capped at ${cap} watched pages per domain. Remove one or contact support for a higher limit.` };
    }
    if (inserted.kind === "duplicate") {
      return { ok: false, error: "That URL is already being watched." };
    }

    auditLog("watched_page.added", {
      userId: session.user.id, monitoredDomainId: dom.id, host: dom.host, url: normalized,
    });

    // "Audit on add"; fire an immediate audit run forced to refetch this URL.
    // Reuses the existing audit/requested pipeline; isPublic=false matches the
    // Pro private-by-default convention, expiresAt mirrors lib/monitoring.ts.
    //
    // Rate-limit gate: this path bypasses /api/audits, so apply the same
    // suite of gates that route enforces. Without all of them a Pro user
    // spam-clicking add can fire 20 audits × 500 pages = 10,000 fetched
    // URLs against one host in seconds: past the 30/hr per-host throttle
    // and worker-pool burst budget. When any gate trips, the watched row
    // stays pinned (it's just a list entry; no cost) and the URL is audited
    // on the next monitoring tick instead.
    const immediateAuditDeferReason = await assertProAuditAllowed({
      userId: session.user.id,
      host: dom.host,
    });
    if (immediateAuditDeferReason) {
      auditLog("audit.request.rate_limited", { reason: immediateAuditDeferReason, userId: session.user.id, plan: "pro" });
    } else {
      const auditSlug = publicSlug();
      const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
      const [audit] = await db.insert(audits).values({
        slug: auditSlug, userId: session.user.id, sourceUrl: dom.sourceUrl,
        status: "queued", expiresAt, isPublic: false,
      }).returning({ id: audits.id });

      // Best-effort: the watched page is already saved; a queue failure here
      // must not roll the whole add back to an error.
      await enqueueAudit(
        audit.id,
        { url: dom.sourceUrl, plan: "pro", sampleSize: PRO_REAUDIT_SAMPLE_SIZE, mode: "full", force: { urls: [normalized] } },
        { userId: session.user.id, host: dom.host },
      );
    }

    revalidatePath(`/dashboard/${encodeURIComponent(dom.host)}`);
    return { ok: true, id: inserted.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to add watched page." };
  }
}

/**
 * Remove a watched page. Authorisation goes through the parent monitored
 * domain's user_id: no cross-tenant deletes possible because the SELECT
 * filters on the session user before issuing the delete.
 */
export async function removeWatchedPage(
  watchedPageId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const [row] = await db
    .select({
      id: watchedPages.id,
      url: watchedPages.url,
      monitoredDomainId: watchedPages.monitoredDomainId,
      host: monitoredDomains.host,
    })
    .from(watchedPages)
    .innerJoin(monitoredDomains, eq(monitoredDomains.id, watchedPages.monitoredDomainId))
    .where(and(
      eq(watchedPages.id, watchedPageId),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .limit(1);
  if (!row) return { ok: false, error: "not found" };

  await db.delete(watchedPages).where(eq(watchedPages.id, row.id));
  auditLog("watched_page.removed", {
    userId: session.user.id, monitoredDomainId: row.monitoredDomainId, host: row.host, url: row.url,
  });
  revalidatePath(`/dashboard/${encodeURIComponent(row.host)}`);
  return { ok: true };
}

