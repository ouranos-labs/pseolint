import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/turnstile", () => ({ verifyTurnstileToken: vi.fn().mockResolvedValue(true) }));
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
vi.mock("@/lib/rate-limit", () => ({ bumpRateLimit: vi.fn().mockResolvedValue({ allowed: true, count: 1 }) }));
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

describe("POST /api/audits", () => {
  it("202 with auditId on valid request", async () => {
    const { POST } = await import("@/app/api/audits/route");
    const req = new Request("http://localhost/api/audits", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
      body: JSON.stringify({ url: "https://example.com/", turnstileToken: "tok" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(202);
    const json = await res.json();
    expect(json.auditId).toBe("audit-1");
    expect(json.reportUrl).toBe("/a/audit-1");
  });

  it("503 origin_unreachable when the pre-flight probe can't reach the origin", async () => {
    // Force the pre-flight on (off by default outside production). The `.invalid`
    // TLD never resolves (RFC 2606), so every probe fails its DNS-validated hop
    // → verdict "unreachable" → the route refuses to dispatch. No network needed.
    process.env.DISABLE_ORIGIN_PREFLIGHT = "0";
    try {
      const { POST } = await import("@/app/api/audits/route");
      const req = new Request("http://localhost/api/audits", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.5" },
        body: JSON.stringify({ url: "https://nonexistent.invalid/", turnstileToken: "tok" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.code).toBe("origin_unreachable");
    } finally {
      delete process.env.DISABLE_ORIGIN_PREFLIGHT;
    }
  });
});
