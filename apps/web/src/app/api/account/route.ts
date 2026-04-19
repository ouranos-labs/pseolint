import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, users } from "@/db/schema";
import { deleteReport } from "@/lib/r2";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";

export async function DELETE(_req: Request): Promise<Response> {
  let session;
  try { session = await requireSession(); } catch (r) { return r as Response; }
  const uid = session.user.id;

  const userAudits = await db.select({ id: audits.id, storageKey: audits.storageKey }).from(audits).where(eq(audits.userId, uid));
  for (const a of userAudits) {
    if (a.storageKey) { try { await deleteReport(a.storageKey); } catch { /* already gone */ } }
  }
  await db.delete(users).where(eq(users.id, uid));  // cascades via FKs
  return NextResponse.json({ ok: true });
}
