import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { assertSafeUrl } from "@/lib/ssrf";
import { getPlan } from "@/lib/plan";
import { bumpRateLimit } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getOptionalSession, getOrCreateAnonSessionId } from "@/lib/session";
import { inngest } from "@/lib/inngest";
import { extractClientIp, hashIp, todayDateString } from "@/lib/ids";
import { auditMode, readOnlyMessage, disabledMessage } from "@/lib/audit-mode";
import { auditLog } from "@/lib/audit-log";
import { devFlags } from "@/lib/dev-flags";
import { checkBlocklist, hostBlockKey, userBlockKey } from "@/lib/blocklist";
import { publicSlug } from "@/lib/slug";
import { clientIp } from "@/lib/ip";
import { reserveAnonAuditSlot, pageCapFor, ANON_DAILY_CAP } from "@/lib/audit-limits";
import { normalizeUserUrl } from "@/lib/normalize-url";

export const runtime = "nodejs";

const BodySchema = z.object({
  // Accepts bare hostnames ("example.com") and adds https:// — see normalizeUserUrl.
  url: z.string().min(1).transform((raw, ctx) => {
    const normalized = normalizeUserUrl(raw);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid URL" });
      return z.NEVER;
    }
    return normalized;
  }),
  // Optional: required for anon callers, ignored for verified sessioned callers.
  turnstileToken: z.string().min(1).optional(),
  force: z.boolean().optional(),
  /** Opt-in Playwright-rendered audit for JS-heavy sites (SPA, Webflow, Framer). */
  render: z.boolean().optional(),
});

const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const URL_COOLDOWN_MS = 5 * 60 * 1000;
const PER_HOST_HOURLY_LIMIT = 30;
const SAMPLE_SIZE_CEILING = 300;
const IN_FLIGHT_LIMIT_FREE = 1;
const IN_FLIGHT_LIMIT_PRO = 5;
const IN_FLIGHT_LIMIT_ANON = 1;
// Anti-harassment: one user can only audit a given host N times per day. Caps
// the realistic damage one attacker can do to a third-party site, even if they
// max out their daily quota across many different targets.
const PER_USER_HOST_DAILY_PRO = 15;
const PER_USER_HOST_DAILY_FREE = 3;
const PER_ANON_HOST_DAILY = 1;
const PER_ANON_IP_HOST_DAILY = 1;

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

  // Fetch session early — verified sessioned callers skip Turnstile (they already passed
  // magic-link auth + email verification, which is a stronger anti-abuse signal than a CAPTCHA).
  const session = await getOptionalSession();
  const sessionTrusted = !!session?.user.emailVerified;

  if (!sessionTrusted) {
    if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken, ip))) {
      auditLog("audit.request.rejected", { reason: "bot_check_failed", url });
      return NextResponse.json({ error: "Bot check failed" }, { status: 400 });
    }
  }

  try {
    await assertSafeUrl(url);
  } catch (e) {
    auditLog("audit.request.rejected", { reason: "ssrf", url, err: (e as Error).message });
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const host = safeHost(url);

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
    // Match recent completed audits for this URL that the caller can actually view:
    // public audits OR private audits owned by the current session. This closes the
    // loophole where Pro users (private-by-default) could re-audit the same URL
    // unbounded since the public-only filter never matched their previous runs.
    const visibleToCaller = session
      ? or(eq(audits.isPublic, true), eq(audits.userId, session.user.id))
      : eq(audits.isPublic, true);
    const [cached] = await db
      .select({ id: audits.id, slug: audits.slug })
      .from(audits)
      .where(
        and(
          eq(audits.sourceUrl, url),
          eq(audits.status, "completed"),
          visibleToCaller,
          gt(audits.completedAt, cutoff),
        ),
      )
      .orderBy(desc(audits.completedAt))
      .limit(1);

    if (cached) {
      auditLog("audit.request.deduped", { url, existingAuditId: cached.id });
      return NextResponse.json(
        { auditId: cached.id, reportUrl: `/r/${cached.slug}`, cached: true },
        { status: 200 },
      );
    }
  }

  const today = todayDateString();
  let userId: string | null = null;
  let plan: "free" | "pro" = "free";
  let anonSessionId: string | null = null;
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
    if (!session.user.emailVerified) {
      auditLog("audit.request.rejected", { reason: "email_not_verified", userId: session.user.id });
      return NextResponse.json(
        { error: "Verify your email before running audits. Check your inbox for the magic-link email." },
        { status: 403 },
      );
    }
    userId = session.user.id;
    // getPlan encapsulates the expiry check + dev-bypass — single source of truth.
    plan = await getPlan(userId);
    // "Never expires" for Pro — far-future sentinel Postgres can serialize.
    // JS max date (year 275760) round-trips as `+275760-09-13T...` which Postgres's
    // timestamptz parser rejects.
    expiresAt = plan === "pro" ? new Date("9999-12-31T23:59:59.999Z") : addDays(30);

    if (!devFlags.rateLimitDisabled) {
      const key = plan === "pro" ? `pro:${userId}:${today}` : `free:${userId}:${today}`;
      const limit = plan === "pro" ? 50 : 5;
      const { allowed } = await bumpRateLimit(key, limit);
      if (!allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_user", userId, plan });
        return NextResponse.json({ error: "Daily audit limit reached" }, { status: 429 });
      }
      // Per-user-per-host daily cap — anti-harassment for third-party targets.
      const hostKey = `user-host:${userId}:${host}:${today}`;
      const hostLimit = plan === "pro" ? PER_USER_HOST_DAILY_PRO : PER_USER_HOST_DAILY_FREE;
      const hostRes = await bumpRateLimit(hostKey, hostLimit);
      if (!hostRes.allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_user_host", userId, plan, host });
        return NextResponse.json(
          { error: `You've reached today's limit for ${host} (${hostLimit}/day). Try a different site or come back tomorrow.` },
          { status: 429 },
        );
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
      // Per-anon-session-per-host daily cap — anon attackers can't focus all
      // their daily quota on one target.
      const anonHostKey = `anon-host:${anonSessionId}:${host}:${today}`;
      const anonHostRes = await bumpRateLimit(anonHostKey, PER_ANON_HOST_DAILY);
      if (!anonHostRes.allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_anon_host", anonSessionId, host });
        return NextResponse.json(
          { error: `Anon limit for ${host} reached (${PER_ANON_HOST_DAILY}/day). Sign in to audit it again.` },
          { status: 429 },
        );
      }
    }
  }

  // Compute tier for page cap and IP-based anon rate limit.
  const tier: "anon" | "free" | "pro" = !session ? "anon" : plan;

  if (tier === "anon" && !devFlags.rateLimitDisabled) {
    const slot = await reserveAnonAuditSlot(clientIp(req));
    if (slot === null) {
      auditLog("audit.request.rate_limited", { reason: "per_ip_anon" });
      return NextResponse.json(
        { error: `Anon audits limited to ${ANON_DAILY_CAP} per day. Sign in for unlimited.` },
        { status: 429 },
      );
    }
    // Per-IP-per-host daily cap — closes residential-proxy + anon-cookie-clear
    // attack vector. Even with rotating IPs, each IP can only target a host once.
    const ipHostKey = `anon-ip-host:${hashIp(clientIp(req))}:${host}:${today}`;
    const ipHostRes = await bumpRateLimit(ipHostKey, PER_ANON_IP_HOST_DAILY);
    if (!ipHostRes.allowed) {
      auditLog("audit.request.rate_limited", { reason: "per_ip_anon_host", host });
      return NextResponse.json(
        { error: `Anon limit for ${host} reached (${PER_ANON_IP_HOST_DAILY}/day from this network). Sign in to audit it again.` },
        { status: 429 },
      );
    }
  }

  // In-flight cap: prevents a single caller from queueing many audits in parallel
  // (the daily cap rejects #N+1 but doesn't space out the burst). Bounds Inngest
  // queue depth and target-site burst per origin.
  if (!devFlags.rateLimitDisabled) {
    const inFlightLimit =
      tier === "pro" ? IN_FLIGHT_LIMIT_PRO :
      tier === "free" ? IN_FLIGHT_LIMIT_FREE :
      IN_FLIGHT_LIMIT_ANON;
    const ownerFilter = userId
      ? eq(audits.userId, userId)
      : eq(audits.anonSessionId, anonSessionId!);
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(audits)
      .where(and(ownerFilter, inArray(audits.status, ["queued", "running"])));
    if (count >= inFlightLimit) {
      auditLog("audit.request.in_flight_limited", { tier, userId, anonSessionId, count, inFlightLimit });
      return NextResponse.json(
        { error: `Too many audits in flight (${count}/${inFlightLimit}). Wait for one to finish.` },
        { status: 429 },
      );
    }
  }

  const requestedSampleSize = Math.min(pageCapFor(tier), SAMPLE_SIZE_CEILING);

  const [row] = await db.insert(audits).values({
    slug: publicSlug(), userId, anonSessionId, sourceUrl: url, status: "queued",
    isPublic: plan !== "pro", expiresAt,
  }).returning({ id: audits.id, slug: audits.slug });

  const render = body.data.render ?? false;
  auditLog("audit.created", { auditId: row.id, userId, anonSessionId, plan, tier, host, sampleSize: requestedSampleSize, render });

  await inngest.send({ name: "audit/requested", data: { auditId: row.id, url, plan, sampleSize: requestedSampleSize, render } });
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
