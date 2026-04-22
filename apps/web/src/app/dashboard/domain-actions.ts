"use server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { publicSlug } from "@/lib/slug";
import { assertSafeUrl } from "@/lib/ssrf";
import { inngest } from "@/lib/inngest";

function originOf(rawUrl: string): { host: string; origin: string } {
  const u = new URL(rawUrl);
  return { host: u.host, origin: `${u.protocol}//${u.host}` };
}

export async function addDomainAction(
  rawUrl: string,
): Promise<{ ok: true; host: string } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  try {
    await assertSafeUrl(rawUrl);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid URL" };
  }

  const { host, origin } = originOf(rawUrl);

  const [existing] = await db
    .select({ removedAt: monitoredDomains.removedAt })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, session.user.id), eq(monitoredDomains.host, host)))
    .limit(1);

  if (existing) {
    if (existing.removedAt) {
      await db.update(monitoredDomains)
        .set({ removedAt: null, sourceUrl: origin })
        .where(and(eq(monitoredDomains.userId, session.user.id), eq(monitoredDomains.host, host)));
    }
  } else {
    await db.insert(monitoredDomains).values({
      slug: publicSlug(), userId: session.user.id, sourceUrl: origin, host,
      cadence: "daily", nextRunAt: new Date(),
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

  return { ok: true, host };
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
): Promise<{ ok: true; auditSlug: string } | { ok: false; error: string }> {
  let session;
  try { session = await requireSession(); } catch { return { ok: false, error: "not signed in" }; }

  const [dom] = await db.select({ id: monitoredDomains.id, sourceUrl: monitoredDomains.sourceUrl })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, domainHost),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    )).limit(1);
  if (!dom) return { ok: false, error: "not found" };

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

  return { ok: true, auditSlug };
}
