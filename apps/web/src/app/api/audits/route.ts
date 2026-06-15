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
import { pageCapFor, ANON_DAILY_CAP, DAILY_AUDIT_CAP } from "@/lib/audit-limits";
import { reserveAnonAuditSlot } from "@/lib/anon-rate-limit";
import { checkOriginHealth } from "@pseolint/core";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { assertProAuditAllowed, PER_HOST_HOURLY_LIMIT, PER_USER_HOST_DAILY_PRO } from "@/lib/audit-gate";
import { trackServerAfter } from "@/lib/analytics/track.server";
import type { AuditBlockReason } from "@/lib/analytics/events";

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
// Public-form sample-size ceiling. Pro users requesting an audit via the
// homepage form / API hit this cap (300 pages); the larger 500-page budget
// advertised on /limits applies only to dashboard "Re-audit now" and
// monitoring kickoff (see PRO_REAUDIT_SAMPLE_SIZE in lib/audit-limits.ts).
// The split is intentional cost control on the unauthenticated POST surface
// — public submissions can't burn the full Pro budget without going through
// the rate-limited dashboard path.
const SAMPLE_SIZE_CEILING = 300;
const IN_FLIGHT_LIMIT_FREE = 1;
const IN_FLIGHT_LIMIT_ANON = 1;
// Anti-harassment: one user can only audit a given host N times per day. Caps
// the realistic damage one attacker can do to a third-party site, even if they
// max out their daily quota across many different targets.
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
    trackServerAfter({ name: "audit_blocked", props: { reason: "paused", status: 503 } });
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

  // Best-effort attribution: sessioned callers by user id; anon block events
  // ride OpenPanel's cookieless hash (the anon cookie may not exist yet here).
  const blockProfileId = session?.user.id;
  const trackBlocked = (reason: AuditBlockReason, status: number): void => {
    trackServerAfter({ name: "audit_blocked", props: { reason, status } }, { profileId: blockProfileId });
  };

  if (!sessionTrusted) {
    if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken, ip))) {
      auditLog("audit.request.rejected", { reason: "bot_check_failed", url });
      trackBlocked("bot_check", 400);
      return NextResponse.json({ error: "Bot check failed" }, { status: 400 });
    }
  }

  try {
    await assertSafeUrl(url);
  } catch (e) {
    auditLog("audit.request.rejected", { reason: "ssrf", url, err: (e as Error).message });
    trackBlocked("private_url", 400);
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
      trackServerAfter({ name: "audit_created", props: { host, cached: true, authed: !!session } }, { profileId: session?.user.id });
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

  // Per-host global rate limit — protects target sites during viral-post
  // amplification. v0.5.6 refinement: Pro requests get the per-host check
  // exclusively from `assertProAuditAllowed`. Doing it here too would
  // double-bump the counter and silently halve the documented 30/hr limit
  // for Pro callers. Anon and free still bump here.
  let isProSession = false;
  if (session && session.user.emailVerified) {
    isProSession = (await getPlan(session.user.id)) === "pro";
  }
  if (!devFlags.rateLimitDisabled && !isProSession) {
    const { allowed } = await bumpRateLimit(`audit-host:${host}:${currentHourKey()}`, PER_HOST_HOURLY_LIMIT);
    if (!allowed) {
      auditLog("audit.request.rate_limited", { reason: "per_host", host });
      trackBlocked("domain_limit", 429);
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
    // getPlan was already called above to decide isProSession; reuse that.
    plan = isProSession ? "pro" : "free";
    // "Never expires" for Pro — far-future sentinel Postgres can serialize.
    // JS max date (year 275760) round-trips as `+275760-09-13T...` which Postgres's
    // timestamptz parser rejects.
    expiresAt = plan === "pro" ? new Date("9999-12-31T23:59:59.999Z") : addDays(30);

    if (!devFlags.rateLimitDisabled) {
      if (plan === "pro") {
        // Pro gates are consolidated in the shared helper (daily cap + per-host
        // hourly + per-user-host daily + in-flight). Redundant with the
        // route-level per-host-hourly check above, but acceptable until v0.5.5.
        const gateReason = await assertProAuditAllowed({ userId: userId!, host });
        if (gateReason) {
          auditLog("audit.request.rate_limited", { reason: gateReason, userId, plan });
          if (gateReason === "blocklisted") {
            return NextResponse.json(
              { error: "This audit cannot be run. Contact support if you believe this is in error." },
              { status: 403 },
            );
          }
          if (gateReason === "per_host") {
            trackBlocked("domain_limit", 429);
            return NextResponse.json(
              { error: `Too many audits for ${host} this hour. Try again later.` },
              { status: 429 },
            );
          }
          if (gateReason === "per_user_host") {
            trackBlocked("domain_limit", 429);
            return NextResponse.json(
              { error: `You've reached today's limit for ${host} (${PER_USER_HOST_DAILY_PRO}/day). Try a different site or come back tomorrow.` },
              { status: 429 },
            );
          }
          if (gateReason === "in_flight") {
            return NextResponse.json(
              { error: `Too many audits in flight. Wait for one to finish.` },
              { status: 429 },
            );
          }
          // gateReason === "per_user"
          trackBlocked("daily_limit", 429);
          return NextResponse.json({ error: "Daily audit limit reached" }, { status: 429 });
        }
      } else {
        // Free user inline gates.
        const key = `free:${userId}:${today}`;
        const limit = DAILY_AUDIT_CAP[plan];
        const { allowed } = await bumpRateLimit(key, limit);
        if (!allowed) {
          auditLog("audit.request.rate_limited", { reason: "per_user", userId, plan });
          trackBlocked("daily_limit", 429);
          return NextResponse.json({ error: "Daily audit limit reached" }, { status: 429 });
        }
        // Per-user-per-host daily cap — anti-harassment for third-party targets.
        const hostKey = `user-host:${userId}:${host}:${today}`;
        const hostRes = await bumpRateLimit(hostKey, PER_USER_HOST_DAILY_FREE);
        if (!hostRes.allowed) {
          auditLog("audit.request.rate_limited", { reason: "per_user_host", userId, plan, host });
          trackBlocked("domain_limit", 429);
          return NextResponse.json(
            { error: `You've reached today's limit for ${host} (${PER_USER_HOST_DAILY_FREE}/day). Try a different site or come back tomorrow.` },
            { status: 429 },
          );
        }
      }
    }
  } else {
    anonSessionId = await getOrCreateAnonSessionId();
    expiresAt = addDays(1);
    if (!devFlags.rateLimitDisabled) {
      const anonKey = `anon:${anonSessionId}:${today}`;
      const { allowed } = await bumpRateLimit(anonKey, ANON_DAILY_CAP);
      if (!allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_anon", anonSessionId });
        trackBlocked("session_limit", 429);
        return NextResponse.json({ error: "Session limit reached — sign in for more" }, { status: 429 });
      }
      // Per-anon-session-per-host daily cap — anon attackers can't focus all
      // their daily quota on one target.
      const anonHostKey = `anon-host:${anonSessionId}:${host}:${today}`;
      const anonHostRes = await bumpRateLimit(anonHostKey, PER_ANON_HOST_DAILY);
      if (!anonHostRes.allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_anon_host", anonSessionId, host });
        trackBlocked("domain_limit", 429);
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
      trackBlocked("session_limit", 429);
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
      trackBlocked("domain_limit", 429);
      return NextResponse.json(
        { error: `Anon limit for ${host} reached (${PER_ANON_IP_HOST_DAILY}/day from this network). Sign in to audit it again.` },
        { status: 429 },
      );
    }
  }

  // In-flight cap for free and anon tiers — prevents a single caller from
  // queueing many audits in parallel. Pro in-flight is handled by
  // assertProAuditAllowed above (same DB query, same limit constant).
  if (tier !== "pro" && !devFlags.rateLimitDisabled) {
    const inFlightLimit = tier === "free" ? IN_FLIGHT_LIMIT_FREE : IN_FLIGHT_LIMIT_ANON;
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

  // Pre-flight origin health check. The in-flight BackpressureMonitor only
  // trips after a crawl has already fired dozens of requests at a struggling
  // origin (the paperforge/Neon incident). A concurrent probe at the entry URL
  // tells us the origin's state up front. We only *block* when the origin is
  // unreachable — there is genuinely nothing to audit, so no false-positive /
  // override concern. A `degraded` origin is NOT blocked here: the audit
  // proceeds and `run-audit` automatically drops it to gentle (low-concurrency)
  // mode, which is friendlier than refusing the run. `force` (sessioned
  // override) and the dev flag both skip the probe.
  if (!forceNew && !devFlags.preflightDisabled) {
    const health = await checkOriginHealth(url, { probes: 3, timeoutMs: 4000 });
    if (health.verdict === "unreachable") {
      auditLog("audit.request.preflight_blocked", {
        url, host, verdict: health.verdict, reason: health.reason,
        responded: health.responded, attempted: health.attempted,
      });
      trackBlocked("origin_unreachable", 503);
      return NextResponse.json(
        {
          error: `We couldn't reach ${host} — ${health.reason}. pseolint pre-flights your origin before crawling, so a failed run doesn't pile load on a server that's already down. Check the URL is live, then try again.`,
          code: "origin_unreachable",
        },
        { status: 503 },
      );
    }
    if (health.verdict === "degraded") {
      // Not fatal — let it run gentle. Logged so we can see how often it happens.
      auditLog("audit.request.preflight_degraded", {
        url, host, reason: health.reason, medianMs: health.medianMs, errorRatio: health.errorRatio,
      });
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

  trackServerAfter(
    { name: "audit_created", props: { host, cached: false, authed: !!userId } },
    { profileId: userId ?? anonSessionId ?? undefined },
  );
  return NextResponse.json({ auditId: row.id, reportUrl: `/a/${row.id}` }, { status: 202 });
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
