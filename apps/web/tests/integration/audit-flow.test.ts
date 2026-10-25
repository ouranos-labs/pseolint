import { describe, it, expect, vi, beforeEach } from "vitest";

// The route is the only consumer of @pseolint/core in this graph (run-audit is
// mocked below), so mocking just checkOriginHealth is safe and lets us drive
// each pre-flight verdict deterministically without touching the network.
const { preflightMock, bumpMock, refundMock, turnstileMock } = vi.hoisted(() => ({
  preflightMock: vi.fn(),
  bumpMock: vi.fn(),
  refundMock: vi.fn(),
  turnstileMock: vi.fn(),
}));
vi.mock("@pseolint/core", () => ({ checkOriginHealth: preflightMock }));

vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: turnstileMock }));
vi.mock("@/lib/inngest", () => ({
  inngest: {
    send: vi.fn().mockResolvedValue({ ids: ["e1"] }),
    createFunction: vi.fn(() => ({ id: "run-audit" })),
  },
}));
vi.mock("@/inngest/functions/run-audit", () => ({
  runAudit: { id: "run-audit" },
  executeAuditInProcess: vi.fn().mockResolvedValue({ ok: true, score: 42 }),
}));
vi.mock("@/lib/rate-limit", () => ({ bumpRateLimit: bumpMock, refundRateLimits: refundMock }));
vi.mock("@/lib/anon-rate-limit", () => ({
  reserveAnonAuditSlot: vi.fn().mockResolvedValue(1),
  anonAuditSlotKey: () => "anon:audit:iphash:day",
}));
vi.mock("@/lib/ssrf", () => ({ assertSafeUrl: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/session", () => ({
  getOptionalSession: vi.fn().mockResolvedValue(null),
  getOrCreateAnonSessionId: vi.fn().mockResolvedValue("anon-123"),
}));

vi.mock("@/db", () => {
  const whereChain = {
    limit: async () => [] as unknown[],
    orderBy: () => ({ limit: async () => [] as unknown[] }),
  };
  return {
    db: {
      select: () => ({ from: () => ({ where: () => whereChain }) }),
      insert: () => ({ values: () => ({ returning: async () => [{ id: "audit-1" }] }) }),
    },
  };
});
vi.mock("@/db/schema", () => ({ audits: {}, userProfiles: {}, blocklist: { key: {}, reason: {} } }));
vi.mock("@/lib/blocklist", () => ({
  checkBlocklist: vi.fn().mockResolvedValue(null),
  userBlockKey: (id: string) => `user:${id}`,
  hostBlockKey: (h: string) => `host:${h}`,
}));

const ENV = {
  DATABASE_URL: "postgresql://x/y", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "x".repeat(32),
  RESEND_API_KEY: "re_x", RESEND_FROM: "t@e.com", INNGEST_EVENT_KEY: "e", INNGEST_SIGNING_KEY: "s",
  R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "a", R2_SECRET_ACCESS_KEY: "a", R2_BUCKET: "b",
  POLAR_ACCESS_TOKEN: "p", POLAR_WEBHOOK_SECRET: "w", POLAR_MONTHLY_PRODUCT_ID: "m", POLAR_YEARLY_PRODUCT_ID: "y",
  TURNSTILE_SECRET_KEY: "t", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "t", IP_HASH_SALT: "y".repeat(16),
};
for (const [k, v] of Object.entries(ENV)) process.env[k] = v;

function auditRequest(ip: string, url = "https://example.com/") {
  return new Request("http://localhost/api/audits", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ url, turnstileToken: "tok" }),
  });
}

const HEALTHY = { verdict: "ok", medianMs: 80, maxMs: 90, errorRatio: 0, responded: 3, attempted: 3, samples: [] };

describe("POST /api/audits", () => {
  beforeEach(() => {
    preflightMock.mockReset();
    bumpMock.mockReset().mockResolvedValue({ allowed: true, count: 1 });
    refundMock.mockReset().mockResolvedValue(undefined);
    turnstileMock.mockReset().mockResolvedValue(true);
    delete process.env.DISABLE_ORIGIN_PREFLIGHT;
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it("202 with auditId on valid request (pre-flight off by default in test env)", async () => {
    const { POST } = await import("@/app/api/audits/route");
    const res = await POST(auditRequest("1.2.3.4"));
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.auditId).toBe("audit-1");
    expect(json.reportUrl).toBe("/a/audit-1");
    expect(preflightMock).not.toHaveBeenCalled();
  });

  it("202 when the pre-flight is on and the origin is healthy", async () => {
    process.env.DISABLE_ORIGIN_PREFLIGHT = "0";
    preflightMock.mockResolvedValue(HEALTHY);
    const { POST } = await import("@/app/api/audits/route");
    const res = await POST(auditRequest("1.2.3.5"));
    expect(res.status).toBe(202);
    expect(preflightMock).toHaveBeenCalledOnce();
  });

  it("503 origin_unreachable when the pre-flight can't reach the origin", async () => {
    process.env.DISABLE_ORIGIN_PREFLIGHT = "0";
    preflightMock.mockResolvedValue({ ...HEALTHY, verdict: "unreachable", reason: "no response from 3 probes", responded: 0 });
    const { POST } = await import("@/app/api/audits/route");
    const res = await POST(auditRequest("1.2.3.6"));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("origin_unreachable");
    expect(json.host).toBe("example.com");
    expect(json.reason).toBe("no response from 3 probes");
    expect(typeof json.error).toBe("string");
  });

  it("400 invalid_url for an unparseable URL", async () => {
    const { POST } = await import("@/app/api/audits/route");
    const res = await POST(auditRequest("1.2.3.8", "not a url"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_url");
  });

  it("400 turnstile_failed when the bot check is rejected", async () => {
    turnstileMock.mockResolvedValue(false);
    const { POST } = await import("@/app/api/audits/route");
    const res = await POST(auditRequest("1.2.3.9"));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("turnstile_failed");
  });

  it("503 paused carries a code when audits are in readonly mode", async () => {
    process.env.AUDITS_MODE = "readonly";
    try {
      const { POST } = await import("@/app/api/audits/route");
      const res = await POST(auditRequest("1.2.3.10"));
      expect(res.status).toBe(503);
      expect((await res.json()).code).toBe("paused");
    } finally {
      delete process.env.AUDITS_MODE;
    }
  });

  describe("with rate limits on", () => {
    beforeEach(() => { process.env.DISABLE_RATE_LIMIT = "0"; });

    it("429 quota_session with used/limit/resetsAt/tier, and refunds every counter it bumped", async () => {
      // per-host hourly passes, then the anon session cap trips (4th of 3).
      bumpMock
        .mockResolvedValueOnce({ allowed: true, count: 1 })
        .mockResolvedValueOnce({ allowed: false, count: 4 });
      const { POST } = await import("@/app/api/audits/route");
      const res = await POST(auditRequest("1.2.3.11"));
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json).toMatchObject({ code: "quota_session", used: 3, limit: 3, tier: "anon" });
      expect(new Date(json.resetsAt).getUTCHours()).toBe(0);
      expect(new Date(json.resetsAt).getTime()).toBeGreaterThan(Date.now());
      expect(json.error).not.toMatch(/unlimited/i);
      const refunded = refundMock.mock.calls[0][0] as string[];
      expect(refunded).toHaveLength(2);
      expect(refunded[0]).toMatch(/^audit-host:example\.com:/);
      expect(refunded[1]).toMatch(/^anon:anon-123:/);
    });

    it("429 quota_host for the per-site anon cap", async () => {
      bumpMock
        .mockResolvedValueOnce({ allowed: true, count: 1 })
        .mockResolvedValueOnce({ allowed: true, count: 1 })
        .mockResolvedValueOnce({ allowed: false, count: 2 });
      const { POST } = await import("@/app/api/audits/route");
      const res = await POST(auditRequest("1.2.3.12"));
      expect(res.status).toBe(429);
      expect(await res.json()).toMatchObject({ code: "quota_host", used: 1, limit: 1, tier: "anon", host: "example.com" });
    });

    it("429 rate_host_hourly with retryAfterSec", async () => {
      bumpMock.mockResolvedValueOnce({ allowed: false, count: 31 });
      const { POST } = await import("@/app/api/audits/route");
      const res = await POST(auditRequest("1.2.3.13"));
      expect(res.status).toBe(429);
      const json = await res.json();
      expect(json.code).toBe("rate_host_hourly");
      expect(json.retryAfterSec).toBeGreaterThan(0);
      expect(json.retryAfterSec).toBeLessThanOrEqual(3600);
    });

    it("a dispatched run carries the bumped keys so a failed run can refund them", async () => {
      const { inngest } = await import("@/lib/inngest");
      const send = vi.mocked(inngest.send);
      send.mockClear();
      const { POST } = await import("@/app/api/audits/route");
      const res = await POST(auditRequest("1.2.3.14"));
      expect(res.status).toBe(202);
      const data = (send.mock.calls[0][0] as { data: { refundKeys?: string[] } }).data;
      expect(data.refundKeys).toEqual(expect.arrayContaining([
        expect.stringMatching(/^audit-host:/),
        expect.stringMatching(/^anon:anon-123:/),
        expect.stringMatching(/^anon-host:anon-123:example\.com:/),
        "anon:audit:iphash:day",
        expect.stringMatching(/^anon-ip-host:/),
      ]));
      expect(refundMock).not.toHaveBeenCalled();
    });
  });

  it("proceeds (202) when the origin is degraded: run-audit drops it to gentle, the route does not block", async () => {
    process.env.DISABLE_ORIGIN_PREFLIGHT = "0";
    preflightMock.mockResolvedValue({ ...HEALTHY, verdict: "degraded", reason: "origin median response 9000ms exceeds 8000ms", medianMs: 9000 });
    const { POST } = await import("@/app/api/audits/route");
    const res = await POST(auditRequest("1.2.3.7"));
    expect(res.status).toBe(202);
  });
});
