import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { getOptionalSession, getOrCreateAnonSessionId } from "@/lib/session";
import { getPlan } from "@/lib/plan";
import { PAGE_CAP } from "@/lib/audit-limits";
import { parseAuditFailure } from "@/lib/audit-failure";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(): Response {
  return NextResponse.json({ error: "Not found", code: "not_found" }, { status: 404 });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  // A non-UUID id used to reach Postgres and come back as a 500, which the
  // progress page rendered as a failed audit. It is simply not an audit.
  if (!UUID_RE.test(id)) return notFound();
  const [row] = await db.select().from(audits).where(eq(audits.id, id)).limit(1);
  if (!row || row.status === "expired") return notFound();

  const session = await getOptionalSession();
  const anon = await getOrCreateAnonSessionId();
  const ownedByUser = session?.user.id && row.userId === session.user.id;
  const ownedByAnon = !session && row.anonSessionId === anon;
  if (!row.isPublic && !ownedByUser && !ownedByAnon) {
    return NextResponse.json({ error: "Forbidden", code: "forbidden" }, { status: 403 });
  }

  const inFlight = row.status === "queued" || row.status === "running";
  // The page budget the run was dispatched with, so the progress copy quotes
  // the real cap. Pro budgets vary by entry point (300 / 500 / 200), so no
  // single number is honest there: null and the copy stays generic.
  let pageCap: number | null = null;
  if (inFlight) {
    const tier = row.userId ? await getPlan(row.userId) : "anon";
    pageCap = tier === "pro" ? null : PAGE_CAP[tier];
  }
  const failure = row.status === "failed" ? parseAuditFailure(row.errorMessage) : null;

  return NextResponse.json({
    id: row.id, slug: row.slug, status: row.status, risk: row.risk, pageCount: row.pageCount,
    findingCount: row.findingCount, completedAt: row.completedAt, createdAt: row.createdAt,
    sourceUrl: row.sourceUrl,
    pageCap,
    viewer: session ? "user" : "anon",
    errorMessage: failure?.raw ?? null,
    failureCode: failure?.code ?? null,
    slotRefunded: failure?.refunded ?? null,
  });
}
