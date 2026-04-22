import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains, audits } from "@/db/schema";
import { publicSlug } from "@/lib/slug";
import { inngest } from "@/lib/inngest";

/**
 * Webhook-safe variant of addDomainAction — no session required.
 * Called from the Polar webhook when monitor-intent checkout completes.
 * Caller is responsible for verifying that the userId + audit ownership match.
 */
export async function ensureMonitoredDomainForUser(
  userId: string,
  rawUrl: string,
): Promise<{ host: string }> {
  const u = new URL(rawUrl);
  const host = u.host;
  const origin = `${u.protocol}//${u.host}`;

  const [existing] = await db
    .select({ id: monitoredDomains.id, removedAt: monitoredDomains.removedAt })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.userId, userId), eq(monitoredDomains.host, host)))
    .limit(1);

  if (existing) {
    if (existing.removedAt) {
      await db
        .update(monitoredDomains)
        .set({ removedAt: null, sourceUrl: origin })
        .where(eq(monitoredDomains.id, existing.id));
    }
  } else {
    await db.insert(monitoredDomains).values({
      slug: publicSlug(),
      userId,
      sourceUrl: origin,
      host,
      cadence: "daily",
      nextRunAt: new Date(),
    });
  }

  const auditSlug = publicSlug();
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const [audit] = await db
    .insert(audits)
    .values({
      slug: auditSlug,
      userId,
      sourceUrl: origin,
      status: "queued",
      expiresAt,
      isPublic: false,
    })
    .returning({ id: audits.id });

  await inngest.send({
    name: "audit/requested",
    data: { auditId: audit.id, url: origin, plan: "pro", sampleSize: 500 },
  });

  return { host };
}
