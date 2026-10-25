/**
 * The audit-request error contract, both halves in one isomorphic module.
 *
 * Server: POST /api/audits rejects with `{ error, code, ...details }` built by
 * the `*Body` helpers below, so every rejection carries a stable machine code
 * plus the numbers the copy needs (used / limit / resetsAt / tier, ...).
 *
 * Client: `describeAuditError` turns (status, body) into ONE view model that
 * every audit form renders the same way: one cause, one next action, and a
 * tone that is only destructive-red for things the user typed wrong or a real
 * server fault. Rate limits, pauses and blocks are not the user's fault and
 * read as warning / neutral.
 *
 * No server-only imports here: this module ships to the browser.
 */
import { DAILY_AUDIT_CAP, PER_HOST_DAILY_CAP } from "@/lib/audit-limits";

export const AUDIT_ERROR_CODES = [
  "quota_daily",
  "quota_session",
  "quota_host",
  "rate_host_hourly",
  "in_flight",
  "cooldown",
  "blocklisted",
  "origin_unreachable",
  "paused",
  "turnstile_failed",
  "invalid_url",
  "email_unverified",
] as const;

export type AuditErrorCode = (typeof AUDIT_ERROR_CODES)[number];
export type AuditTier = "anon" | "free" | "pro";

export const SUPPORT_EMAIL = "hello@pseolint.dev";
/** Shared with every URL input's placeholder ("yoursite.com"). */
export const URL_HINT = "Try a domain like yoursite.com.";

export type AuditErrorBody = {
  error: string;
  code: AuditErrorCode;
  used?: number;
  limit?: number;
  /** ISO timestamp the counter resets (UTC midnight for daily caps). */
  resetsAt?: string;
  tier?: AuditTier;
  host?: string;
  /** in_flight: the audit already running, so the UI can link to it. */
  auditId?: string;
  /** cooldown / rate_host_hourly: seconds until the button may be pressed again. */
  retryAfterSec?: number;
  /** origin_unreachable / invalid_url: short machine-ish reason. */
  reason?: string;
};

// ---------------------------------------------------------------------------
// Time math (pure, unit-tested)
// ---------------------------------------------------------------------------

/** Next 00:00 UTC strictly after `now`: when every daily counter rolls over (see todayDateString). */
export function nextUtcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

/** Start of the next UTC hour: when the per-host hourly counter rolls over. */
export function nextUtcHour(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1));
}

/** "3h 12m" / "12m" / "1m": a coarse duration for reset copy. Rounds up so we never promise early. */
export function formatHoursMinutes(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "4:05" / "0:09": a live countdown label. */
export function formatCountdown(totalSec: number): string {
  const s = Math.max(0, Math.ceil(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds left until `untilMs`, floored at 0. */
export function secondsUntil(untilMs: number, nowMs: number = Date.now()): number {
  return Math.max(0, Math.ceil((untilMs - nowMs) / 1000));
}

// ---------------------------------------------------------------------------
// Server-side body builders
// ---------------------------------------------------------------------------

export function quotaBody(args: {
  code: "quota_daily" | "quota_session" | "quota_host";
  used: number;
  limit: number;
  tier: AuditTier;
  host?: string;
  now?: Date;
}): AuditErrorBody {
  const used = Math.min(Math.max(0, args.used), args.limit);
  const scope = args.code === "quota_host" && args.host ? ` of ${args.host}` : "";
  return {
    code: args.code,
    error: `${used} of ${args.limit} audits${scope} used today.`,
    used,
    limit: args.limit,
    resetsAt: nextUtcMidnight(args.now).toISOString(),
    tier: args.tier,
    ...(args.host ? { host: args.host } : {}),
  };
}

export function hostHourlyBody(host: string, limit: number, now: Date = new Date()): AuditErrorBody {
  const reset = nextUtcHour(now);
  return {
    code: "rate_host_hourly",
    error: `${host} has reached its hourly audit limit.`,
    host,
    limit,
    resetsAt: reset.toISOString(),
    retryAfterSec: secondsUntil(reset.getTime(), now.getTime()),
  };
}

export function rejectionBody(
  code: Exclude<AuditErrorCode, "quota_daily" | "quota_session" | "quota_host" | "rate_host_hourly">,
  error: string,
  details: Omit<AuditErrorBody, "code" | "error"> = {},
): AuditErrorBody {
  return { code, error, ...details };
}

// ---------------------------------------------------------------------------
// Client-side view model
// ---------------------------------------------------------------------------

export type AuditErrorTone = "danger" | "warning" | "neutral";

export type AuditErrorView = {
  code: AuditErrorCode | "network" | "unknown" | "bot_check_pending" | "unauthorized_confirm";
  tone: AuditErrorTone;
  message: string;
  hint?: string;
  action?: { label: string; href: string };
  /** Long explanation behind a <details>. */
  details?: { summary: string; body: string };
  /** Epoch ms: the submit button stays disabled and a live countdown shows until then. */
  cooldownUntil?: number;
};

export type DescribeContext = {
  now?: Date;
  /** Where sign-in should return to (e.g. "/?prefill=https://site.com"). Defaults to "/". */
  returnTo?: string;
};

export function signInHref(returnTo = "/"): string {
  return `/signin?callbackUrl=${encodeURIComponent(returnTo)}`;
}

function isBody(raw: unknown): raw is Partial<AuditErrorBody> {
  return typeof raw === "object" && raw !== null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function tierAction(
  tier: AuditTier | undefined,
  perSite: boolean,
  returnTo: string | undefined,
): AuditErrorView["action"] {
  const suffix = perSite ? "/day per site" : "/day";
  if (tier === "anon") {
    const n = perSite ? PER_HOST_DAILY_CAP.free : DAILY_AUDIT_CAP.free;
    return { label: `Sign in (free) for ${n}${suffix}`, href: signInHref(returnTo) };
  }
  if (tier === "free") {
    const n = perSite ? PER_HOST_DAILY_CAP.pro : DAILY_AUDIT_CAP.pro;
    return { label: `Go Pro for ${n}${suffix}`, href: "/pricing" };
  }
  return undefined;
}

/**
 * Map an audit-request rejection to what the user sees. Unknown codes and
 * legacy free-text bodies fall back to a generic, still-honest message.
 */
export function describeAuditError(status: number, raw: unknown, ctx: DescribeContext = {}): AuditErrorView {
  const now = ctx.now ?? new Date();
  const body = isBody(raw) ? raw : {};
  const code = body.code;
  const serverMessage = str(body.error);

  switch (code) {
    case "quota_daily":
    case "quota_session":
    case "quota_host": {
      const limit = num(body.limit);
      const used = num(body.used) ?? limit;
      const host = str(body.host);
      const resetsAt = str(body.resetsAt) ? new Date(body.resetsAt as string) : nextUtcMidnight(now);
      const inText = formatHoursMinutes(resetsAt.getTime() - now.getTime());
      const scope = code === "quota_host" && host ? ` of ${host}` : "";
      const head = limit != null && used != null ? `${used} of ${limit} audits${scope} used today.` : (serverMessage ?? "Daily audit limit reached.");
      return {
        code,
        tone: "warning",
        message: `${head} Resets at 00:00 UTC (in ${inText}).`,
        action: tierAction(body.tier, code === "quota_host", ctx.returnTo),
      };
    }
    case "rate_host_hourly": {
      const host = str(body.host) ?? "This site";
      const retry = num(body.retryAfterSec) ?? secondsUntil(nextUtcHour(now).getTime(), now.getTime());
      return {
        code,
        tone: "warning",
        message: `${host} has had a lot of audits this hour, so we're pausing new ones to protect the site.`,
        hint: "You can try again when the countdown ends.",
        cooldownUntil: now.getTime() + retry * 1000,
      };
    }
    case "in_flight": {
      const id = str(body.auditId);
      return {
        code,
        tone: "neutral",
        message: "You already have an audit running.",
        hint: "Wait for it to finish before starting another.",
        action: id ? { label: "View progress", href: `/a/${id}` } : undefined,
      };
    }
    case "cooldown": {
      const retry = num(body.retryAfterSec) ?? 60;
      return {
        code,
        tone: "neutral",
        message: "This URL was audited a moment ago.",
        hint: "You can run it again when the countdown ends.",
        cooldownUntil: now.getTime() + retry * 1000,
      };
    }
    case "blocklisted":
      return {
        code,
        tone: "neutral",
        message: "We can't run an audit for this site.",
        hint: `If you think this is a mistake, email ${SUPPORT_EMAIL}.`,
        action: { label: "Contact support", href: `mailto:${SUPPORT_EMAIL}` },
      };
    case "origin_unreachable": {
      const host = str(body.host) ?? "the site";
      const reason = str(body.reason);
      return {
        code,
        tone: "warning",
        message: `We couldn't reach ${host}${reason ? ` (${reason})` : ""}. Check the site is live, then try again.`,
        details: {
          summary: "Why?",
          body:
            "Before every crawl, pseolint sends a few quick requests to your homepage. If none of them get an answer, " +
            "there is nothing to audit, and starting a crawl would only add load to a server that may already be down. " +
            "Common causes: the domain has a typo, the site is offline, or a firewall is blocking automated requests.",
        },
      };
    }
    case "paused":
      return {
        code,
        tone: "neutral",
        message: serverMessage ?? "New audits are paused for a moment.",
        hint: "Please try again a little later.",
      };
    case "turnstile_failed":
      return {
        code,
        tone: "warning",
        message: "The bot check didn't go through.",
        hint: "We've reset it. Once it passes, submit again.",
      };
    case "invalid_url":
      return {
        code,
        tone: "danger",
        message: serverMessage ?? "That doesn't look like a site address.",
        hint: URL_HINT,
      };
    case "email_unverified":
      return {
        code,
        tone: "warning",
        message: "Verify your email before running audits.",
        hint: "Check your inbox for the sign-in email.",
      };
  }

  if (status >= 500) {
    return {
      code: "unknown",
      tone: "danger",
      message: "Something went wrong on our side.",
      hint: "Please try again in a moment.",
    };
  }
  return {
    code: "unknown",
    tone: "danger",
    message: serverMessage ?? `The audit couldn't start (HTTP ${status}).`,
    hint: "Please try again in a moment.",
  };
}

/** fetch() threw: the request never reached us. */
export function networkErrorView(): AuditErrorView {
  return {
    code: "network",
    tone: "warning",
    message: "We couldn't reach pseolint.",
    hint: "Check your connection, then try again.",
  };
}

/** Client-side validation: same copy as the server's invalid_url. */
export function invalidUrlView(): AuditErrorView {
  return { code: "invalid_url", tone: "danger", message: "That doesn't look like a site address.", hint: URL_HINT };
}

export function confirmAuthorizationView(): AuditErrorView {
  return {
    code: "unauthorized_confirm",
    tone: "warning",
    message: "Please confirm you're authorized to audit this URL.",
    hint: "Tick the box below the URL field. We only ask once.",
  };
}

export function botCheckFailedView(): AuditErrorView {
  return {
    code: "bot_check_pending",
    tone: "warning",
    message: "Bot check couldn't load.",
    hint: "Use Retry under the URL field. Your URL stays as typed.",
  };
}

export function botCheckPendingView(): AuditErrorView {
  return {
    code: "bot_check_pending",
    tone: "neutral",
    message: "The bot check hasn't finished yet.",
    hint: "It usually passes on its own within a few seconds, then you can submit.",
  };
}
