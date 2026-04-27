import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { getPlan } from "@/lib/plan";

export const runtime = "nodejs";
const Body = z.object({ isPublic: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  // Making a report private is a Pro-gated action. Public ↔ Public is always allowed.
  if (body.data.isPublic === false) {
    const isPro = (await getPlan(session.user.id)) === "pro";
    if (!isPro) {
      return NextResponse.json(
        { error: "Private reports are a Pro feature", upgrade: "/pricing" },
        { status: 402 },
      );
    }
  }

  const result = await db.update(audits)
    .set({ isPublic: body.data.isPublic })
    .where(and(eq(audits.id, id), eq(audits.userId, session.user.id)))
    .returning({ id: audits.id, slug: audits.slug });
  if (result.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Drop the leaderboard's ISR cache so a flipped-private audit disappears immediately,
  // and re-render the report page so its public/private label updates for non-owner viewers.
  revalidatePath("/leaderboard");
  revalidatePath(`/r/${result[0].slug}`);

  return NextResponse.json({ ok: true, isPublic: body.data.isPublic });
}
