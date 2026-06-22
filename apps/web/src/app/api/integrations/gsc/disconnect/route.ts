import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { monitoredDomains } from "@/db/schema";
import { getOptionalSession } from "@/lib/session";
import { disconnectGsc } from "@/lib/gsc";
import { auditLog } from "@/lib/audit-log";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Disconnect GSC. Wipes the OAuth tokens and unbinds the property URL from
 * every monitored domain so the sync cron stops looking for them. We do not
 * delete the historical `gscPageMetrics` rows — the queue still benefits from
 * the snapshot until the next merge runs.
 */
export async function POST(): Promise<Response> {
  const session = await getOptionalSession();
  if (!session) return new Response("Unauthorized", { status: 401 });

  await disconnectGsc(session.user.id);
  await db.update(monitoredDomains)
    .set({ gscSiteUrl: null })
    .where(eq(monitoredDomains.userId, session.user.id));

  auditLog("gsc.oauth.disconnected", { userId: session.user.id });
  const url = new URL("/dashboard/integrations?gsc=disconnected", env().BETTER_AUTH_URL);
  return NextResponse.redirect(url, { status: 303 });
}
