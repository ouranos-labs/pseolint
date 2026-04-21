import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { audits, userProfiles } from "@/db/schema";
import { assertSafeUrl } from "@/lib/ssrf";
import { bumpRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getOptionalSession, getOrCreateAnonSessionId } from "@/lib/session";
import { inngest } from "@/lib/inngest";
import { extractClientIp, hashIp, todayDateString } from "@/lib/ids";
import { auditMode, readOnlyMessage, disabledMessage } from "@/lib/audit-mode";
import { auditLog } from "@/lib/audit-log";
import { devFlags } from "@/lib/dev-flags";
import { checkBlocklist, hostBlockKey, userBlockKey } from "@/lib/blocklist";

export const runtime = "nodejs";

const BodySchema = z.object({
  url: z.string().url(),
  turnstileToken: z.string().min(1),
  force: z.boolean().optional(),
});

const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const URL_COOLDOWN_MS = 5 * 60 * 1000;
const PER_HOST_HOURLY_LIMIT = 30;
const SAMPLE_SIZE_CEILING = 300;

function addDays(n: number): Date { return new Date(Date.now() + n * 86_400_000); }
function currentHourKey(): string { return new Date().toISOString().slice(0, 13); } // YYYY-MM-DDTHH

function normalizeAuditUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Strip trailing slash on pathname for dedupe/cooldown consistency — treat "/" vs "" as same URL.
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return raw;
  }
}

export async function POST(req: Request): Promise<Response> {
  const mode = auditMode();
  if (mode !== "normal") {
    auditLog("audit.request.rejected", { reason: `mode=${mode}` });
    return NextResponse.json(
      { error: mode === "disabled" ? disabledMessage() : readOnlyMessage() },
      { status: 503 },
    );
  }

  const ip = extractClientIp(req.headers);
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    auditLog("audit.request.rejected", { reason: "invalid_body" });
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { turnstileToken, force } = body.data;
  const url = normalizeAuditUrl(body.data.url);

  auditLog("audit.request.received", { url, force: !!force });

  if (!devFlags.botCheckDisabled && !(await verifyTurnstileToken(turnstileToken, ip))) {
    auditLog("audit.request.rejected", { reason: "bot_check_failed", url });
    return NextResponse.json({ error: "Bot check failed" }, { status: 400 });
  }

  try {
    await assertSafeUrl(url);
  } catch (e) {
    auditLog("audit.request.rejected", { reason: "ssrf", url, err: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const host = safeHost(url);
  const session = await getOptionalSession();

  // Blocklist — reject known-bad user or host before any other work.
  const keysToCheck: string[] = [hostBlockKey(host)];
  if (session) keysToCheck.push(userBlockKey(session.user.id));
  const blocked = await checkBlocklist(keysToCheck);
  if (blocked) {
    auditLog("audit.request.rejected", { reason: "blocklisted", key: blocked.key });
    return NextResponse.json(
      { error: "This audit cannot be run. Contact support if you believe this is in error." },
      { status: 403 },
    );
  }

  const forceNew = force === true && !!session;

  if (forceNew) {
    const cooldownCutoff = new Date(Date.now() - URL_COOLDOWN_MS);
    const [recent] = await db
      .select({ id: audits.id, createdAt: audits.createdAt })
      .from(audits)
      .where(and(eq(audits.sourceUrl, url), gt(audits.createdAt, cooldownCutoff)))
      .orderBy(desc(audits.createdAt))
      .limit(1);
    if (recent) {
      const waitSec = Math.max(1, Math.ceil(
        (recent.createdAt.getTime() + URL_COOLDOWN_MS - Date.now()) / 1000,
      ));
      auditLog("audit.request.cooldown", { url, waitSec });
      return NextResponse.json(
        { error: `This URL was just audited. Try again in ${waitSec}s.` },
        { status: 429 },
      );
    }
  }

  if (!forceNew) {
    const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const [cached] = await db
      .select({ id: audits.id })
      .from(audits)
      .where(
        and(
          eq(audits.sourceUrl, url),
          eq(audits.status, "completed"),
          eq(audits.isPublic, true),
          gt(audits.completedAt, cutoff),
        ),
      )
      .orderBy(desc(audits.completedAt))
      .limit(1);

    if (cached) {
      auditLog("audit.request.deduped", { url, existingAuditId: cached.id });
      return NextResponse.json(
        { auditId: cached.id, reportUrl: `/r/${cached.id}`, cached: true },
        { status: 200 },
      );
    }
  }

  const today = todayDateString();
  let userId: string | null = null;
  let plan: "free" | "pro" = "free";
  let anonSessionId: string | null = null;
  let sampleSize = 50;
  let expiresAt: Date;

  // Per-host global rate limit — protects target sites during viral-post amplification.
  if (!devFlags.rateLimitDisabled) {
    const { allowed } = await bumpRateLimit(`audit-host:${host}:${currentHourKey()}`, PER_HOST_HOURLY_LIMIT);
    if (!allowed) {
      auditLog("audit.request.rate_limited", { reason: "per_host", host });
      return NextResponse.json(
        { error: `Too many audits for ${host} this hour. Try again later.` },
        { status: 429 },
      );
    }
  }

  if (session) {
    userId = session.user.id;
    const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
    plan = profile[0]?.plan ?? "free";
    sampleSize = Math.min(plan === "pro" ? 200 : 50, SAMPLE_SIZE_CEILING);
    expiresAt = plan === "pro" ? new Date(8640000000000000) : addDays(30);

    if (!devFlags.rateLimitDisabled) {
      const key = plan === "pro" ? `pro:${userId}:${today}` : `free:${userId}:${today}`;
      const limit = plan === "pro" ? 50 : 5;
      const { allowed } = await bumpRateLimit(key, limit);
      if (!allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_user", userId, plan });
        return NextResponse.json({ error: "Daily audit limit reached" }, { status: 429 });
      }
    }
  } else {
    anonSessionId = await getOrCreateAnonSessionId();
    expiresAt = addDays(1);
    if (!devFlags.rateLimitDisabled) {
      const anonKey = `anon:${anonSessionId}:${today}`;
      const { allowed } = await bumpRateLimit(anonKey, 3);
      if (!allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_anon", anonSessionId });
        return NextResponse.json({ error: "Session limit reached — sign in for more" }, { status: 429 });
      }
    }
  }

  const [row] = await db.insert(audits).values({
    userId, anonSessionId, sourceUrl: url, status: "queued",
    isPublic: plan !== "pro", expiresAt,
  }).returning({ id: audits.id });

  auditLog("audit.created", { auditId: row.id, userId, anonSessionId, plan, host, sampleSize });

  await inngest.send({ name: "audit/requested", data: { auditId: row.id, url, plan, sampleSize } });
  auditLog("audit.dispatched", { auditId: row.id });

  void hashIp(ip);

  return NextResponse.json({ auditId: row.id, reportUrl: `/a/${row.id}` }, { status: 202 });
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
