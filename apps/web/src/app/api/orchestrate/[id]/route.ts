import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orchestratorSessions, fixManifests } from "@/db/schema";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Poll endpoint: returns the current state of an orchestrator session,
 * plus the manifest slug if one was produced. Owner-only — surfaces
 * 404 (not 403) for foreign sessions to avoid leaking session ids.
 *
 * Live event streaming via SSE is Phase 5 batch 2.
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
    .select()
    .from(orchestratorSessions)
    .where(eq(orchestratorSessions.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.userId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Look up the manifest slug if the session produced one. Cheap join on
  // session_id; index on fix_manifest.session_id keeps it O(1).
  const [manifest] = await db
    .select({
      slug: fixManifests.slug,
      verdict: fixManifests.verdict,
      validPatchCount: fixManifests.validPatchCount,
      totalPatchCount: fixManifests.totalPatchCount,
      pagePatchCount: fixManifests.pagePatchCount,
      templatePatchCount: fixManifests.templatePatchCount,
      domainPatchCount: fixManifests.domainPatchCount,
    })
    .from(fixManifests)
    .where(eq(fixManifests.sessionId, id))
    .limit(1);

  return NextResponse.json({
    sessionId: row.id,
    domain: row.domain,
    status: row.status,
    reason: row.reason,
    budgetUsd: Number(row.budgetUsd),
    spentUsd: Number(row.spentUsd),
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    toolCallCount: row.toolCallCount,
    durationMs: row.durationMs,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    manifest: manifest ?? null,
  });
}
