import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { assertSafeUrl } from "@/lib/ssrf";
import { getPlan } from "@/lib/plan";
import { bumpRateLimit, refundRateLimits } from "@/lib/rate-limit";
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
import { pageCapFor, ANON_DAILY_CAP, DAILY_AUDIT_CAP, PER_HOST_DAILY_CAP } from "@/lib/audit-limits";
import { anonAuditSlotKey, reserveAnonAuditSlot } from "@/lib/anon-rate-limit";
import { checkOriginHealth } from "@pseolint/core";
import { normalizeUserUrl } from "@/lib/normalize-url";
import { getMarketingTool } from "@/lib/marketing-tools";
import { resolveAuditChannel } from "@/lib/audit-channel";
import { assertProAuditAllowed, proGateKeys, PER_HOST_HOURLY_LIMIT } from "@/lib/audit-gate";
import { trackServerAfter } from "@/lib/analytics/track.server";
import type { AuditBlockReason } from "@/lib/analytics/events";
import {
  hostHourlyBody,
  quotaBody,
  rejectionBody,
  SUPPORT_EMAIL,
  type AuditErrorBody,
} from "@/lib/audit-errors";

export const runtime = "nodejs";

const BodySchema = z.object({
  // Accepts bare hostnames ("example.com") and adds https://, see normalizeUserUrl.
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
  /** Originating /tools/[slug] entry point: validated against the tool registry below. */
  tool: z.string().optional(),
  /** Referring channel, validated against AUDIT_CHANNELS below. */
  channel: z.string().optional(),
});

const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const URL_COOLDOWN_MS = 5 * 60 * 1000;
// Public-form sample-size ceiling. Pro users requesting an audit via the
// homepage form / API hit this cap (300 pages); the larger 500-page budget
// advertised on /limits applies only to dashboard "Re-audit now" and
// monitoring kickoff (see PRO_REAUDIT_SAMPLE_SIZE in lib/audit-limits.ts).
// The split is intentional cost control on the unauthenticated POST surface
//: public submissions can't burn the full Pro budget without going through
// the rate-limited dashboard path.
const SAMPLE_SIZE_CEILING = 300;
const IN_FLIGHT_LIMIT_FREE = 1;
const IN_FLIGHT_LIMIT_ANON = 1;
const BLOCKLISTED_MESSAGE = `We can't run an audit for this site. Contact ${SUPPORT_EMAIL} if you believe this is in error.`;

function addDays(n: number): Date { return new Date(Date.now() + n * 86_400_000); }
function currentHourKey(): string { return new Date().toISOString().slice(0, 13); } // YYYY-MM-DDTHH

function normalizeAuditUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Strip trailing slash on pathname for dedupe/cooldown consistency: treat "/" vs "" as same URL.
    if (u.pathname.length > 1 && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * Every rejection is `{ error, code, ...details }` (see lib/audit-errors.ts):
 * the client maps the stable `code`, never the free-text `error`.
 */
function rejectJson(body: AuditErrorBody, status: number): Response {
  return NextResponse.json(body, { status });
}

export async function POST(req: Request): Promise<Response> {
  const mode = auditMode();
  if (mode !== "normal") {
    auditLog("audit.request.rejected", { reason: `mode=${mode}` });
    trackServerAfter({ name: "audit_blocked", props: { reason: "paused", status: 503 } });
    return rejectJson(rejectionBody("paused", mode === "disabled" ? disabledMessage() : readOnlyMessage()), 503);
  }

  const ip = extractClientIp(req.headers);
  const body = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    auditLog("audit.request.rejected", { reason: "invalid_body" });
    return rejectJson(rejectionBody("invalid_url", "That doesn't look like a site address."), 400);
  }
  const { turnstileToken, force } = body.data;
  const url = normalizeAuditUrl(body.data.url);

  auditLog("audit.request.received", { url, force: !!force });

  // Fetch session early: verified sessioned callers skip Turnstile (they already passed
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
      return rejectJson(rejectionBody("turnstile_failed", "Bot check failed."), 400);
    }
  }

  const host = safeHost(url);

  try {
    await assertSafeUrl(url);
  } catch (e) {
    auditLog("audit.request.rejected", { reason: "ssrf", url, err: (e as Error).message });
    trackBlocked("private_url", 400);
    // assertSafeUrl folds "doesn't resolve" and "resolves to a private
    // address" into one error; for a real user the overwhelmingly common
    // cause is a typo, so lead with that.
    return rejectJson(
      rejectionBody("invalid_url", `We couldn't find a public website at ${host}. Check the spelling, then try again.`, {
        host,
        reason: "not a public, resolvable address",
      }),
      400,
    );
  }

  // Blocklist: reject known-bad user or host before any other work.
  const keysToCheck: string[] = [hostBlockKey(host)];
  if (session) keysToCheck.push(userBlockKey(session.user.id));
  const blocked = await checkBlocklist(keysToCheck);
  if (blocked) {
    auditLog("audit.request.rejected", { reason: "blocklisted", key: blocked.key });
    return rejectJson(rejectionBody("blocklisted", BLOCKLISTED_MESSAGE), 403);
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
      return rejectJson(
        rejectionBody("cooldown", `This URL was just audited. Try again in ${waitSec}s.`, { retryAfterSec: waitSec }),
        429,
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

  // Every counter this request bumps, in order. Counters are bumped BEFORE the
  // allow check, so a request rejected by gate N has already spent gates
  // 1..N. `reject` hands those back so a refused request costs nothing, and
  // a dispatched run carries them as `refundKeys` so a FAILED run is refunded
  // too (run-audit.ts): otherwise "Try again" after a failure is guaranteed
  // to hit the per-host cap.
  const bumped: string[] = [];
  const bump = async (key: string, limit: number): Promise<{ allowed: boolean; count: number }> => {
    bumped.push(key);
    return bumpRateLimit(key, limit);
  };
  const reject = async (rejection: AuditErrorBody, status: number): Promise<Response> => {
    if (bumped.length > 0) await refundRateLimits(bumped);
    return rejectJson(rejection, status);
  };

  // Per-host global rate limit: protects target sites during viral-post
  // amplification. v0.5.6 refinement: Pro requests get the per-host check
  // exclusively from `assertProAuditAllowed`. Doing it here too would
  // double-bump the counter and silently halve the documented 30/hr limit
  // for Pro callers. Anon and free still bump here.
  let isProSession = false;
  if (session && session.user.emailVerified) {
    isProSession = (await getPlan(session.user.id)) === "pro";
  }
  if (!devFlags.rateLimitDisabled && !isProSession) {
    const { allowed } = await bump(`audit-host:${host}:${currentHourKey()}`, PER_HOST_HOURLY_LIMIT);
    if (!allowed) {
      auditLog("audit.request.rate_limited", { reason: "per_host", host });
      trackBlocked("domain_limit", 429);
      return reject(hostHourlyBody(host, PER_HOST_HOURLY_LIMIT), 429);
    }
  }

  if (session) {
    if (!session.user.emailVerified) {
      auditLog("audit.request.rejected", { reason: "email_not_verified", userId: session.user.id });
      return reject(
        rejectionBody("email_unverified", "Verify your email before running audits. Check your inbox for the magic-link email."),
        403,
      );
    }
    userId = session.user.id;
    // getPlan was already called above to decide isProSession; reuse that.
    plan = isProSession ? "pro" : "free";
    // "Never expires" for Pro: far-future sentinel Postgres can serialize.
    // JS max date (year 275760) round-trips as `+275760-09-13T...` which Postgres's
    // timestamptz parser rejects.
    expiresAt = plan === "pro" ? new Date("9999-12-31T23:59:59.999Z") : addDays(30);

    if (!devFlags.rateLimitDisabled) {
      if (plan === "pro") {
        // Pro gates are consolidated in the shared helper (daily cap + per-host
        // hourly + per-user-host daily + in-flight).
        const gateReason = await assertProAuditAllowed({ userId: userId!, host });
        const proKeys = proGateKeys(userId!, host);
        // Keys the gate bumped before it stopped (it bumps in this order).
        const spent: Record<string, string[]> = {
          blocklisted: [],
          per_user: [proKeys.daily],
          per_host: [proKeys.daily, proKeys.hostHourly],
          per_user_host: [proKeys.daily, proKeys.hostHourly, proKeys.userHost],
          in_flight: [proKeys.daily, proKeys.hostHourly, proKeys.userHost],
        };
        bumped.push(...(gateReason ? (spent[gateReason] ?? []) : spent.in_flight));
        if (gateReason) {
          auditLog("audit.request.rate_limited", { reason: gateReason, userId, plan });
          if (gateReason === "blocklisted") {
            return reject(rejectionBody("blocklisted", BLOCKLISTED_MESSAGE), 403);
          }
          if (gateReason === "per_host") {
            trackBlocked("domain_limit", 429);
            return reject(hostHourlyBody(host, PER_HOST_HOURLY_LIMIT), 429);
          }
          if (gateReason === "per_user_host") {
            trackBlocked("domain_limit", 429);
            return reject(
              quotaBody({ code: "quota_host", used: PER_HOST_DAILY_CAP.pro, limit: PER_HOST_DAILY_CAP.pro, tier: "pro", host }),
              429,
            );
          }
          if (gateReason === "in_flight") {
            const running = await latestInFlightAuditId(eq(audits.userId, userId!));
            return reject(
              rejectionBody("in_flight", "You already have audits running. Wait for one to finish.", running ? { auditId: running } : {}),
              429,
            );
          }
          // gateReason === "per_user"
          trackBlocked("daily_limit", 429);
          return reject(
            quotaBody({ code: "quota_daily", used: DAILY_AUDIT_CAP.pro, limit: DAILY_AUDIT_CAP.pro, tier: "pro" }),
            429,
          );
        }
      } else {
        // Free user inline gates.
        const limit = DAILY_AUDIT_CAP[plan];
        const { allowed, count } = await bump(`free:${userId}:${today}`, limit);
        if (!allowed) {
          auditLog("audit.request.rate_limited", { reason: "per_user", userId, plan });
          trackBlocked("daily_limit", 429);
          return reject(quotaBody({ code: "quota_daily", used: count - 1, limit, tier: "free" }), 429);
        }
        // Per-user-per-host daily cap: anti-harassment for third-party targets.
        const hostRes = await bump(`user-host:${userId}:${host}:${today}`, PER_HOST_DAILY_CAP.free);
        if (!hostRes.allowed) {
          auditLog("audit.request.rate_limited", { reason: "per_user_host", userId, plan, host });
          trackBlocked("domain_limit", 429);
          return reject(
            quotaBody({ code: "quota_host", used: hostRes.count - 1, limit: PER_HOST_DAILY_CAP.free, tier: "free", host }),
            429,
          );
        }
      }
    }
  } else {
    anonSessionId = await getOrCreateAnonSessionId();
    expiresAt = addDays(1);
    if (!devFlags.rateLimitDisabled) {
      const { allowed, count } = await bump(`anon:${anonSessionId}:${today}`, ANON_DAILY_CAP);
      if (!allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_anon", anonSessionId });
        trackBlocked("session_limit", 429);
        return reject(quotaBody({ code: "quota_session", used: count - 1, limit: ANON_DAILY_CAP, tier: "anon" }), 429);
      }
      // Per-anon-session-per-host daily cap: anon attackers can't focus all
      // their daily quota on one target.
      const anonHostRes = await bump(`anon-host:${anonSessionId}:${host}:${today}`, PER_HOST_DAILY_CAP.anon);
      if (!anonHostRes.allowed) {
        auditLog("audit.request.rate_limited", { reason: "per_anon_host", anonSessionId, host });
        trackBlocked("domain_limit", 429);
        return reject(
          quotaBody({ code: "quota_host", used: anonHostRes.count - 1, limit: PER_HOST_DAILY_CAP.anon, tier: "anon", host }),
          429,
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
      return reject(quotaBody({ code: "quota_daily", used: ANON_DAILY_CAP, limit: ANON_DAILY_CAP, tier: "anon" }), 429);
    }
    // The reservation only increments when under the cap, so it is refundable
    // exactly when it succeeded.
    bumped.push(anonAuditSlotKey(clientIp(req)));
    // Per-IP-per-host daily cap: closes residential-proxy + anon-cookie-clear
    // attack vector. Even with rotating IPs, each IP can only target a host once.
    const ipHostRes = await bump(`anon-ip-host:${hashIp(clientIp(req))}:${host}:${today}`, PER_HOST_DAILY_CAP.anon);
    if (!ipHostRes.allowed) {
      auditLog("audit.request.rate_limited", { reason: "per_ip_anon_host", host });
      trackBlocked("domain_limit", 429);
      return reject(
        quotaBody({ code: "quota_host", used: ipHostRes.count - 1, limit: PER_HOST_DAILY_CAP.anon, tier: "anon", host }),
        429,
      );
    }
  }

  // In-flight cap for free and anon tiers: prevents a single caller from
  // queueing many audits in parallel. Pro in-flight is handled by
  // assertProAuditAllowed above.
  if (tier !== "pro" && !devFlags.rateLimitDisabled) {
    const inFlightLimit = tier === "free" ? IN_FLIGHT_LIMIT_FREE : IN_FLIGHT_LIMIT_ANON;
    const ownerFilter = userId
      ? eq(audits.userId, userId)
      : eq(audits.anonSessionId, anonSessionId!);
    const running = await db
      .select({ id: audits.id })
      .from(audits)
      .where(and(ownerFilter, inArray(audits.status, ["queued", "running"])))
      .orderBy(desc(audits.createdAt))
      .limit(inFlightLimit);
    if (running.length >= inFlightLimit) {
      auditLog("audit.request.in_flight_limited", { tier, userId, anonSessionId, count: running.length, inFlightLimit });
      return reject(
        rejectionBody("in_flight", "You already have an audit running. Wait for it to finish.", { auditId: running[0].id }),
        429,
      );
    }
  }

  // Pre-flight origin health check. The in-flight BackpressureMonitor only
  // trips after a crawl has already fired dozens of requests at a struggling
  // origin (the paperforge/Neon incident). A concurrent probe at the entry URL
  // tells us the origin's state up front. We only *block* when the origin is
  // unreachable; there is genuinely nothing to audit, so no false-positive /
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
      const reason = (health.reason ?? "no response").slice(0, 120);
      return reject(
        rejectionBody("origin_unreachable", `We couldn't reach ${host} (${reason}).`, { host, reason }),
        503,
      );
    }
    if (health.verdict === "degraded") {
      // Not fatal: let it run gentle. Logged so we can see how often it happens.
      auditLog("audit.request.preflight_degraded", {
        url, host, reason: health.reason, medianMs: health.medianMs, errorRatio: health.errorRatio,
      });
    }
  }

  const requestedSampleSize = Math.min(pageCapFor(tier), SAMPLE_SIZE_CEILING);

  // Only persist a tool slug that resolves in the registry: never trust the
  // client's raw value (it drives the report's focused-lens view). The audit
  // itself still runs the full rule set; `tool` only affects presentation.
  const tool = body.data.tool && getMarketingTool(body.data.tool) ? body.data.tool : null;

  // Same trust boundary as `tool`: the channel is a hint from the client, so it
  // is resolved against a closed set and falls back to "user". Without this an
  // arbitrary POST could write any string into the column we use to decide
  // which acquisition channel is worth investing in.
  const source = resolveAuditChannel(body.data.channel);

  const [row] = await db.insert(audits).values({
    slug: publicSlug(), userId, anonSessionId, sourceUrl: url, status: "queued",
    isPublic: plan !== "pro", expiresAt, tool, source,
  }).returning({ id: audits.id, slug: audits.slug });

  // Render is a Pro-only capability: gate it server-side so a non-Pro caller
  // can never enable it by hand-crafting the POST body. (The form already hides
  // the toggle for non-Pro, but the client is not the trust boundary.)
  const render = isProSession ? (body.data.render ?? false) : false;
  auditLog("audit.created", { auditId: row.id, userId, anonSessionId, plan, tier, host, sampleSize: requestedSampleSize, render });

  await inngest.send({
    name: "audit/requested",
    data: {
      auditId: row.id, url, plan, sampleSize: requestedSampleSize, render, trigger: "user",
      ...(bumped.length > 0 ? { refundKeys: [...new Set(bumped)] } : {}),
    },
  });
  auditLog("audit.dispatched", { auditId: row.id });

  void hashIp(ip);

  trackServerAfter(
    { name: "audit_created", props: { host, cached: false, authed: !!userId } },
    { profileId: userId ?? anonSessionId ?? undefined },
  );
  return NextResponse.json({ auditId: row.id, reportUrl: `/a/${row.id}` }, { status: 202 });
}

/** Most recent queued/running audit for an owner, so `in_flight` can link to it. */
async function latestInFlightAuditId(ownerFilter: ReturnType<typeof eq>): Promise<string | null> {
  const [row] = await db
    .select({ id: audits.id })
    .from(audits)
    .where(and(ownerFilter, inArray(audits.status, ["queued", "running"])))
    .orderBy(desc(audits.createdAt))
    .limit(1);
  return row?.id ?? null;
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}
