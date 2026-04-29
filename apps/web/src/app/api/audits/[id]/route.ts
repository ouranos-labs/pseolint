import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { getOptionalSession, getOrCreateAnonSessionId } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const [row] = await db.select().from(audits).where(eq(audits.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getOptionalSession();
  const anon = await getOrCreateAnonSessionId();
  const ownedByUser = session?.user.id && row.userId === session.user.id;
  const ownedByAnon = !session && row.anonSessionId === anon;
  if (!row.isPublic && !ownedByUser && !ownedByAnon) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: row.id, slug: row.slug, status: row.status, risk: row.risk, pageCount: row.pageCount,
    findingCount: row.findingCount, errorMessage: row.errorMessage, completedAt: row.completedAt,
    sourceUrl: row.sourceUrl,
  });
}
