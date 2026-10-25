import { describe, it, expect } from "vitest";
import {
  AUDIT_ERROR_CODES,
  describeAuditError,
  formatCountdown,
  formatHoursMinutes,
  hostHourlyBody,
  nextUtcHour,
  nextUtcMidnight,
  quotaBody,
  rejectionBody,
  secondsUntil,
  signInHref,
  SUPPORT_EMAIL,
} from "@/lib/audit-errors";
import { DAILY_AUDIT_CAP, PER_HOST_DAILY_CAP } from "@/lib/audit-limits";

// 2026-10-25 20:47:30 UTC: 3h 12m 30s before the daily reset.
const NOW = new Date("2026-10-25T20:47:30.000Z");

describe("reset / countdown math", () => {
  it("next UTC midnight is the start of the next UTC day", () => {
    expect(nextUtcMidnight(NOW).toISOString()).toBe("2026-10-26T00:00:00.000Z");
    // exactly midnight rolls to the following one, never "now"
    expect(nextUtcMidnight(new Date("2026-10-26T00:00:00.000Z")).toISOString()).toBe("2026-10-27T00:00:00.000Z");
    // month and year boundaries
    expect(nextUtcMidnight(new Date("2026-12-31T23:59:59.000Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("next UTC hour", () => {
    expect(nextUtcHour(NOW).toISOString()).toBe("2026-10-25T21:00:00.000Z");
  });

  it("formats hours/minutes, rounding up so we never promise an early reset", () => {
    expect(formatHoursMinutes(nextUtcMidnight(NOW).getTime() - NOW.getTime())).toBe("3h 13m");
    expect(formatHoursMinutes(12 * 60_000)).toBe("12m");
    expect(formatHoursMinutes(5_000)).toBe("1m");
    expect(formatHoursMinutes(-1)).toBe("1m");
    expect(formatHoursMinutes(2 * 3_600_000)).toBe("2h 0m");
  });

  it("formats a live countdown", () => {
    expect(formatCountdown(245)).toBe("4:05");
    expect(formatCountdown(9)).toBe("0:09");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-3)).toBe("0:00");
  });

  it("seconds until a deadline floors at zero", () => {
    expect(secondsUntil(10_500, 0)).toBe(11);
    expect(secondsUntil(0, 5_000)).toBe(0);
  });
});

describe("server body builders", () => {
  it("quota body carries used / limit / resetsAt / tier", () => {
    const b = quotaBody({ code: "quota_daily", used: 3, limit: 3, tier: "anon", now: NOW });
    expect(b).toMatchObject({ code: "quota_daily", used: 3, limit: 3, tier: "anon", resetsAt: "2026-10-26T00:00:00.000Z" });
    expect(b.error).toBe("3 of 3 audits used today.");
  });

  it("clamps used into [0, limit] (counters are bumped before the check)", () => {
    expect(quotaBody({ code: "quota_session", used: 9, limit: 3, tier: "anon" }).used).toBe(3);
    expect(quotaBody({ code: "quota_session", used: -1, limit: 3, tier: "anon" }).used).toBe(0);
  });

  it("host quota names the host", () => {
    const b = quotaBody({ code: "quota_host", used: 1, limit: 1, tier: "anon", host: "example.com", now: NOW });
    expect(b.host).toBe("example.com");
    expect(b.error).toBe("1 of 1 audits of example.com used today.");
  });

  it("hourly host limit carries retryAfterSec to the top of the hour", () => {
    const b = hostHourlyBody("example.com", 30, NOW);
    expect(b.code).toBe("rate_host_hourly");
    expect(b.retryAfterSec).toBe(12 * 60 + 30);
  });

  it("rejection body merges details", () => {
    expect(rejectionBody("in_flight", "x", { auditId: "a1" })).toEqual({ code: "in_flight", error: "x", auditId: "a1" });
  });
});

describe("describeAuditError", () => {
  const ctx = { now: NOW, returnTo: "/?prefill=https%3A%2F%2Fexample.com%2F" };

  it("anon daily quota: count, reset time, and a free sign-in action", () => {
    const v = describeAuditError(429, quotaBody({ code: "quota_daily", used: 3, limit: 3, tier: "anon", now: NOW }), ctx);
    expect(v.message).toBe("3 of 3 audits used today. Resets at 00:00 UTC (in 3h 13m).");
    expect(v.tone).toBe("warning");
    expect(v.action).toEqual({ label: `Sign in (free) for ${DAILY_AUDIT_CAP.free}/day`, href: signInHref(ctx.returnTo) });
    expect(v.action!.href.startsWith("/signin?callbackUrl=")).toBe(true);
    // never the old false promise
    expect(JSON.stringify(v)).not.toMatch(/unlimited/i);
  });

  it("free daily quota points to Pro, pro gets no CTA", () => {
    const free = describeAuditError(429, quotaBody({ code: "quota_daily", used: 5, limit: 5, tier: "free", now: NOW }), ctx);
    expect(free.action).toEqual({ label: `Go Pro for ${DAILY_AUDIT_CAP.pro}/day`, href: "/pricing" });
    const pro = describeAuditError(429, quotaBody({ code: "quota_daily", used: 50, limit: 50, tier: "pro", now: NOW }), ctx);
    expect(pro.action).toBeUndefined();
    expect(pro.message).toContain("50 of 50 audits used today.");
  });

  it("session quota reads the same as daily", () => {
    const v = describeAuditError(429, quotaBody({ code: "quota_session", used: 3, limit: 3, tier: "anon", now: NOW }), ctx);
    expect(v.message).toBe("3 of 3 audits used today. Resets at 00:00 UTC (in 3h 13m).");
  });

  it("per-site quota quotes per-site caps", () => {
    const v = describeAuditError(
      429,
      quotaBody({ code: "quota_host", used: 1, limit: 1, tier: "anon", host: "example.com", now: NOW }),
      ctx,
    );
    expect(v.message).toBe("1 of 1 audits of example.com used today. Resets at 00:00 UTC (in 3h 13m).");
    expect(v.action?.label).toBe(`Sign in (free) for ${PER_HOST_DAILY_CAP.free}/day per site`);
    const free = describeAuditError(429, quotaBody({ code: "quota_host", used: 3, limit: 3, tier: "free", host: "x.com", now: NOW }), ctx);
    expect(free.action?.label).toBe(`Go Pro for ${PER_HOST_DAILY_CAP.pro}/day per site`);
  });

  it("in_flight links to the running audit", () => {
    const v = describeAuditError(429, rejectionBody("in_flight", "x", { auditId: "abc" }), ctx);
    expect(v.message).toBe("You already have an audit running.");
    expect(v.action).toEqual({ label: "View progress", href: "/a/abc" });
    expect(v.tone).toBe("neutral");
  });

  it("cooldown sets a countdown deadline", () => {
    const v = describeAuditError(429, rejectionBody("cooldown", "x", { retryAfterSec: 90 }), ctx);
    expect(v.cooldownUntil).toBe(NOW.getTime() + 90_000);
    expect(secondsUntil(v.cooldownUntil!, NOW.getTime() + 30_000)).toBe(60);
    expect(secondsUntil(v.cooldownUntil!, NOW.getTime() + 95_000)).toBe(0);
  });

  it("hourly host limit is a warning with a countdown, not red", () => {
    const v = describeAuditError(429, hostHourlyBody("example.com", 30, NOW), ctx);
    expect(v.tone).toBe("warning");
    expect(v.cooldownUntil).toBe(NOW.getTime() + (12 * 60 + 30) * 1000);
  });

  it("origin_unreachable: one cause + action, long explanation behind Why?", () => {
    const v = describeAuditError(
      503,
      rejectionBody("origin_unreachable", "x", { host: "example.com", reason: "no response from 3 probes" }),
      ctx,
    );
    expect(v.message).toBe("We couldn't reach example.com (no response from 3 probes). Check the site is live, then try again.");
    expect(v.details?.summary).toBe("Why?");
    expect(v.tone).toBe("warning");
  });

  it("blocklisted is neutral with a support contact", () => {
    const v = describeAuditError(403, rejectionBody("blocklisted", "x"), ctx);
    expect(v.tone).toBe("neutral");
    expect(v.action?.href).toBe(`mailto:${SUPPORT_EMAIL}`);
  });

  it("paused is neutral and keeps the server's message", () => {
    const v = describeAuditError(503, rejectionBody("paused", "New audits are temporarily paused."), ctx);
    expect(v.tone).toBe("neutral");
    expect(v.message).toBe("New audits are temporarily paused.");
  });

  it("turnstile and invalid url", () => {
    expect(describeAuditError(400, rejectionBody("turnstile_failed", "x"), ctx).hint).toMatch(/reset/i);
    const bad = describeAuditError(400, rejectionBody("invalid_url", "That doesn't look like a site address."), ctx);
    expect(bad.tone).toBe("danger");
    expect(bad.hint).toBe("Try a domain like yoursite.com.");
  });

  it("every code has a mapping (no code falls through to the generic branch)", () => {
    for (const code of AUDIT_ERROR_CODES) {
      const v = describeAuditError(429, { code, error: "x", limit: 1, used: 1 }, ctx);
      expect(v.code).toBe(code);
    }
  });

  it("legacy / unknown bodies fall back honestly", () => {
    expect(describeAuditError(500, { error: "boom" }, ctx).message).toBe("Something went wrong on our side.");
    expect(describeAuditError(418, null, ctx).message).toBe("The audit couldn't start (HTTP 418).");
    expect(describeAuditError(400, { error: "Nope" }, ctx).message).toBe("Nope");
  });
});
