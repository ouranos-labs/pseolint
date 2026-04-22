import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, userProfiles } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { reserveFreeTriageSlot } from "@/lib/usage";
import { getSummary } from "@/lib/r2";
import { triage, type AuditSummary } from "@pseolint/core";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
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
  const [audit] = await db.select().from(audits).where(eq(audits.id, id)).limit(1);
  if (!audit) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (audit.userId !== session.user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!audit.storageKey) {
    return NextResponse.json({ error: "audit not yet complete" }, { status: 409 });
  }

  const [profile] = await db
    .select({ plan: userProfiles.plan, expires: userProfiles.planExpiresAt })
    .from(userProfiles)
    .where(eq(userProfiles.userId, session.user.id))
    .limit(1);
  const isPro =
    profile?.plan === "pro" && (!profile.expires || profile.expires > new Date());

  if (!isPro) {
    const slot = await reserveFreeTriageSlot(session.user.id);
    if (!slot.ok) {
      return NextResponse.json(
        { error: "monthly AI triage quota reached", used: slot.used },
        { status: 402 },
      );
    }
  }

  const summaryKey = audit.storageKey.replace(/\.html$/, ".json");
  const summary: AuditSummary = JSON.parse(await getSummary(summaryKey));
  const triaged = await triage(summary, { maxCostUsd: 0.5 });

  await db.update(audits).set({
    triageRootCauseCount: triaged.rootCauses.length,
    triageCostUsd: String(triaged.estimatedCostUsd ?? 0),
  }).where(eq(audits.id, audit.id));

  return NextResponse.json({ triage: triaged });
}
