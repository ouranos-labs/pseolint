import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { audits, userProfiles } from "@/db/schema";
import { assertSafeUrl } from "@/lib/ssrf";
import { bumpRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getOptionalSession, getOrCreateAnonSessionId } from "@/lib/session";
import { inngest } from "@/lib/inngest";
import { extractClientIp, hashIp, todayDateString } from "@/lib/ids";

export const runtime = "nodejs";

const BodySchema = z.object({ url: z.string().url(), turnstileToken: z.string().min(1) });

function addDays(n: number): Date { return new Date(Date.now() + n * 86_400_000); }

export async function POST(req: Request): Promise<Response> {
  const ip = extractClientIp(req.headers);
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  const { url, turnstileToken } = body.data;

  if (!(await verifyTurnstileToken(turnstileToken, ip))) {
    return NextResponse.json({ error: "Bot check failed" }, { status: 400 });
  }

  try { await assertSafeUrl(url); } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const session = await getOptionalSession();
  const today = todayDateString();
  let userId: string | null = null;
  let plan: "free" | "pro" = "free";
  let anonSessionId: string | null = null;
  let sampleSize = 50;
  let expiresAt: Date;

  if (session) {
    userId = session.user.id;
    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    plan = profile[0]?.plan ?? "free";
    sampleSize = plan === "pro" ? 200 : 50;
    expiresAt = plan === "pro" ? new Date(8640000000000000) : addDays(30);

    const key = plan === "pro" ? `pro:${userId}:${today}` : `free:${userId}:${today}`;
    const limit = plan === "pro" ? 50 : 3;
    const { allowed } = await bumpRateLimit(key, limit);
    if (!allowed) return NextResponse.json({ error: "Daily audit limit reached" }, { status: 429 });
  } else {
    anonSessionId = await getOrCreateAnonSessionId();
    expiresAt = addDays(1);
    const anonKey = `anon:${anonSessionId}:${today}`;
    const { allowed } = await bumpRateLimit(anonKey, 1);
    if (!allowed) return NextResponse.json({ error: "Session limit reached — sign in for more" }, { status: 429 });
  }

  const host = new URL(url).hostname.toLowerCase();
  if (plan !== "pro") {
    const { allowed: domainOk } = await bumpRateLimit(`domain:${host}:${today}`, 3);
    if (!domainOk) return NextResponse.json({ error: "This domain has been audited too many times today" }, { status: 429 });
  }

  const [row] = await db.insert(audits).values({
    userId, anonSessionId, sourceUrl: url, status: "queued",
    isPublic: plan !== "pro", expiresAt,
  }).returning({ id: audits.id });

  await inngest.send({ name: "audit/requested", data: { auditId: row.id, url, plan, sampleSize } });

  void hashIp(ip); // log hash server-side if needed; don't store raw

  return NextResponse.json({ auditId: row.id, reportUrl: `/a/${row.id}` }, { status: 202 });
}
