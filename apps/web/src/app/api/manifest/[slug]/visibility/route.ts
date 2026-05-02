import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { fixManifests, orchestratorSessions } from "@/db/schema";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
const Body = z.object({ isPublic: z.boolean() });

/**
 * Toggle a manifest's `isPublic` flag. Owner-only; mirrors the audit
 * `/api/audits/[id]/visibility` route shape.
 *
 * The semantics, per spec §11.7: a public manifest URL renders a paraphrased
 * view (deterministic findings + summary, no LLM-proposed rewrites). The
 * actual diff content stays owner-only regardless of this toggle. Toggling
 * this is a curation choice (publish to a leaderboard / share for feedback /
 * include in `/research/`) — not a "make my fixes public" choice.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let session;
  try {
    session = await requireSession();
  } catch (r) {
    return r as Response;
  }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  // Verify ownership via the join — the manifest's session must belong to
  // the requesting user. Doing this in one query rather than two round-trips.
  const [row] = await db
    .select({
      manifestId: fixManifests.id,
      sessionUserId: orchestratorSessions.userId,
    })
    .from(fixManifests)
    .innerJoin(orchestratorSessions, eq(fixManifests.sessionId, orchestratorSessions.id))
    .where(eq(fixManifests.slug, slug))
    .limit(1);

  if (!row || row.sessionUserId !== session.user.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  await db
    .update(fixManifests)
    .set({ isPublic: body.data.isPublic })
    .where(and(eq(fixManifests.id, row.manifestId)));

  revalidatePath(`/m/${slug}`);

  return NextResponse.json({ ok: true, isPublic: body.data.isPublic });
}
