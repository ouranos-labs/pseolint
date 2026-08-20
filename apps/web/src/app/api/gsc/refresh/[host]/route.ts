/**
 * POST /api/gsc/refresh/[host]
 *
 * Triggers an on-demand GSC sync for the calling user's monitored domain.
 * Rate-limited to 1 request per user-host pair per hour to prevent GSC API
 * quota exhaustion (GSC allows 1200 QPD / 200 QPM per project).
 *
 * Returns:
 *   200 { queued: true }: event sent; sync will run shortly
 *   200 { queued: false, reason }: domain not ready (no property bound, etc.)
 *   401: not authenticated
 *   404: domain not found or not owned by caller
 *   429: rate limit hit
 */
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { bumpRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest";

export const runtime = "nodejs";

/** 1 on-demand refresh per user-host per hour. */
const RATE_LIMIT_PER_HOUR = 1;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ host: string }> },
): Promise<Response> {
  const session = await getOptionalSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  const { host: rawHost } = await params;
  const host = decodeURIComponent(rawHost);

  const [domain] = await db
    .select({ id: monitoredDomains.id, gscSiteUrl: monitoredDomains.gscSiteUrl })
    .from(monitoredDomains)
    .where(and(
      eq(monitoredDomains.host, host),
      eq(monitoredDomains.userId, session.user.id),
      isNull(monitoredDomains.removedAt),
    ))
    .limit(1);

  if (!domain) return new Response("Not Found", { status: 404 });

  if (!domain.gscSiteUrl) {
    return NextResponse.json({ queued: false, reason: "no-gsc-property-bound" });
  }

  const rlKey = `gsc-refresh:${session.user.id}:${host}`;
  const { allowed } = await bumpRateLimit(rlKey, RATE_LIMIT_PER_HOUR);
  if (!allowed) {
    return new Response("Too Many Requests, 1 refresh per hour per domain", { status: 429 });
  }

  await inngest.send({
    name: "gsc/sync-requested",
    data: { userId: session.user.id, domainId: domain.id },
  });

  return NextResponse.json({ queued: true });
}
