import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
const Body = z.object({ isPublic: z.boolean() });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }
  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const result = await db.update(audits)
    .set({ isPublic: body.data.isPublic })
    .where(and(eq(audits.id, id), eq(audits.userId, session.user.id)))
    .returning({ id: audits.id });
  if (result.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
