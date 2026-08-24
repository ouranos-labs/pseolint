import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { fixManifests, orchestratorSessions } from "@/db/schema";
import { fetchSummaryJson } from "@/lib/r2";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Owner-only manifest download. Returns the full
 * `{ manifest, validation, diff }` payload as JSON: the same blob
 * persisted to R2 by the orchestrator Inngest function. Useful for
 * programmatic consumers (CLI users wanting to apply patches via
 * scripting, third-party integrations, etc.).
 *
 * Foreign visitors get 404 (not 403) to avoid leaking session existence.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  let session;
  try {
    session = await requireSession();
  } catch (r) {
    return r as Response;
  }

  const { id } = await params;

  const [row] = await db
    .select({
      userId: orchestratorSessions.userId,
      manifestKey: fixManifests.manifestKey,
      slug: fixManifests.slug,
      domain: fixManifests.domain,
    })
    .from(orchestratorSessions)
    .leftJoin(fixManifests, eq(fixManifests.sessionId, orchestratorSessions.id))
    .where(eq(orchestratorSessions.id, id))
    .limit(1);

  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!row.manifestKey) {
    return NextResponse.json({ error: "manifest not yet ready" }, { status: 409 });
  }

  const blob = await fetchSummaryJson(row.manifestKey);
  if (!blob) {
    return NextResponse.json({ error: "manifest blob missing or expired" }, { status: 410 });
  }

  return new Response(blob, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${row.slug ?? id}-manifest.json"`,
      "cache-control": "private, no-store",
    },
  });
}
