// apps/web/tests/integration/authz-matrix.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const ENV = {
  DATABASE_URL: "postgresql://x/y", BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "x".repeat(32),
  RESEND_API_KEY: "re_x", RESEND_FROM: "t@e.com", INNGEST_EVENT_KEY: "e", INNGEST_SIGNING_KEY: "s",
  R2_ACCOUNT_ID: "a", R2_ACCESS_KEY_ID: "a", R2_SECRET_ACCESS_KEY: "a", R2_BUCKET: "b",
  POLAR_ACCESS_TOKEN: "p", POLAR_WEBHOOK_SECRET: "w", POLAR_MONTHLY_PRODUCT_ID: "m", POLAR_YEARLY_PRODUCT_ID: "y",
  TURNSTILE_SECRET_KEY: "t", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "t", IP_HASH_SALT: "y".repeat(16),
};
for (const [k, v] of Object.entries(ENV)) process.env[k] = v;

interface Row { id: string; userId: string | null; anonSessionId: string | null; isPublic: boolean; status: string; expiresAt: Date; storageKey: string | null; sourceUrl: string; }

const MAKE_ROW = (over: Partial<Row>): Row => ({
  id: "x", userId: null, anonSessionId: null, isPublic: true, status: "completed",
  expiresAt: new Date(Date.now() + 86400000), storageKey: "k", sourceUrl: "https://x", ...over,
});

let row: Row | undefined;
let session: { user: { id: string; email: string } } | null = null;
let anonId = "anon-A";

vi.mock("@/db", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => row ? [row] : [] }) }) }) },
}));
vi.mock("@/db/schema", () => ({ audits: {}, users: {}, userProfiles: {} }));
vi.mock("@/lib/session", () => ({
  getOptionalSession: async () => session,
  getOrCreateAnonSessionId: async () => anonId,
  requireSession: async () => { if (!session) throw new Response("Unauthorized", { status: 401 }); return session; },
}));

describe("GET /api/audits/[id] authz", () => {
  beforeEach(() => { row = undefined; session = null; anonId = "anon-A"; vi.resetModules(); });

  const load = async () => (await import("@/app/api/audits/[id]/route")).GET;

  it("404 when audit missing", async () => {
    const GET = await load();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("anon reads public audit", async () => {
    row = MAKE_ROW({ id: "1", userId: "user-A", isPublic: true });
    const GET = await load();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(200);
  });

  it("anon denied on private audit of another user", async () => {
    row = MAKE_ROW({ id: "2", userId: "user-A", isPublic: false });
    const GET = await load();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "2" }) });
    expect(res.status).toBe(403);
  });

  it("user-B denied on user-A's private audit", async () => {
    session = { user: { id: "user-B", email: "b@x" } };
    row = MAKE_ROW({ id: "3", userId: "user-A", isPublic: false });
    const GET = await load();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "3" }) });
    expect(res.status).toBe(403);
  });

  it("user-A reads their own private audit", async () => {
    session = { user: { id: "user-A", email: "a@x" } };
    row = MAKE_ROW({ id: "4", userId: "user-A", isPublic: false });
    const GET = await load();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "4" }) });
    expect(res.status).toBe(200);
  });

  it("anon-B denied on anon-A's private-ish audit (but our anon audits are public by default)", async () => {
    anonId = "anon-B";
    row = MAKE_ROW({ id: "5", anonSessionId: "anon-A", isPublic: false });
    const GET = await load();
    const res = await GET(new Request("http://x"), { params: Promise.resolve({ id: "5" }) });
    expect(res.status).toBe(403);
  });
});
