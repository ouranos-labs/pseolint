import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, userProfiles } from "@/db/schema";
import { requireSession } from "@/lib/session";

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
    const [profile] = await db
      .select({ plan: userProfiles.plan, expires: userProfiles.planExpiresAt })
      .from(userProfiles)
      .where(eq(userProfiles.userId, session.user.id))
      .limit(1);
    const isPro =
      profile?.plan === "pro" && (!profile.expires || profile.expires > new Date());
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
    .returning({ id: audits.id });
  if (result.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, isPublic: body.data.isPublic });
}
