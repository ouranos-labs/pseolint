"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { integrations, monitoredDomains } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { assertSafeUrl } from "@/lib/ssrf";
import { publicSlug } from "@/lib/slug";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { autoBindGscPropertiesForUser } from "@/lib/gsc";
import { generateVerificationToken } from "@/lib/domain-verify";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function addMonitoredDomain(rawUrl: string): Promise<ActionResult> {
  const session = await getOptionalSession();
  if (!session) return { ok: false, error: "Sign in required" };

  const url = normalizeUserUrl(rawUrl);
  if (!url) return { ok: false, error: "Invalid URL" };

  try {
    await assertSafeUrl(url);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  try {
    // Small jitter on first schedule (0–30 min) so multiple adds spread across cron ticks.
    const jitterMs = Math.random() * 30 * 60 * 1000;
    await db.insert(monitoredDomains).values({
      slug: publicSlug(),
      userId: session.user.id,
      sourceUrl: url,
      host,
      cadence: "weekly",
      nextRunAt: new Date(Date.now() + jitterMs),
      // Required for the row to be verifiable at all: the auto-verify cron only
      // polls rows that carry a token, and the workspace verify banner renders
      // it. The monitoring cron ignores the domain until `verifiedAt` is set.
      verificationToken: generateVerificationToken(),
    });
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return { ok: false, error: "Already monitoring this domain" };
    }
    return { ok: false, error: "Could not add domain" };
  }

  // If GSC is already connected for this user, attempt to auto-bind the new
  // domain to its matching property. Best-effort: the user's domain is
  // already added; binding failure shouldn't surface as an error.
  const [gscRow] = await db
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.userId, session.user.id), eq(integrations.kind, "gsc")))
    .limit(1);
  if (gscRow) {
    await autoBindGscPropertiesForUser(session.user.id).catch(() => undefined);
  }

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function togglePauseMonitoredDomain(id: string): Promise<ActionResult> {
  const session = await getOptionalSession();
  if (!session) return { ok: false, error: "Sign in required" };

  const [row] = await db
    .select({ paused: monitoredDomains.paused })
    .from(monitoredDomains)
    .where(and(eq(monitoredDomains.id, id), eq(monitoredDomains.userId, session.user.id)))
    .limit(1);
  if (!row) return { ok: false, error: "Not found" };

  await db
    .update(monitoredDomains)
    .set({ paused: !row.paused })
    .where(and(eq(monitoredDomains.id, id), eq(monitoredDomains.userId, session.user.id)));

  revalidatePath("/dashboard");
  return { ok: true };
}

export async function removeMonitoredDomain(id: string): Promise<ActionResult> {
  const session = await getOptionalSession();
  if (!session) return { ok: false, error: "Sign in required" };

  await db
    .delete(monitoredDomains)
    .where(and(eq(monitoredDomains.id, id), eq(monitoredDomains.userId, session.user.id)));

  revalidatePath("/dashboard");
  return { ok: true };
}
