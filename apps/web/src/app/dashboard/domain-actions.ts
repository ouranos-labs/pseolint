"use server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { publicSlug } from "@/lib/slug";
import { assertSafeUrl } from "@/lib/ssrf";
import { inngest } from "@/lib/inngest";
import { MAX_PRO_DOMAINS } from "@/lib/tier-limits";
import { generateVerificationToken, verifyDomainToken } from "@/lib/domain-verify";
import { devFlags } from "@/lib/dev-flags";
import { normalizeUserUrl } from "@/lib/normalize-url";

function originOf(rawUrl: string): { host: string; origin: string } {
  const u = new URL(rawUrl);
  return { host: u.host, origin: `${u.protocol}//${u.host}` };
}

export async function addDomainAction(
  rawUrl: string,
): Promise<{ ok: true; host: string; auditId: string } | { ok: false; error: string }> {
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
      // verifiedAt — ownership must be re-proven each time a domain is re-added.
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

  const auditSlug = publicSlug();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const [audit] = await db.insert(audits).values({
    slug: auditSlug, userId: session.user.id, sourceUrl: origin,
    status: "queued", expiresAt, isPublic: false,
  }).returning({ id: audits.id });

  await inngest.send({
    name: "audit/requested",
    data: { auditId: audit.id, url: origin, plan: "pro", sampleSize: 500, mode: "full" },
  });

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

  await inngest.send({
    name: "audit/requested",
    data: { auditId: audit.id, url: dom.sourceUrl, plan: "pro", sampleSize: 500, mode: "full" },
  });

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
    // Legacy row (pre-migration) — issue a token now so the user can verify.
    await db.update(monitoredDomains)
      .set({ verificationToken: generateVerificationToken() })
      .where(eq(monitoredDomains.id, dom.id));
    return { ok: false, error: "Verification token issued — retry in a moment after publishing the TXT record." };
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
