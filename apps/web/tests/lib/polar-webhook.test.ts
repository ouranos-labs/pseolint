/**
 * The Polar webhook must never 2xx a paid subscription it couldn't attach to a
 * user: Polar only retries non-2xx, so a 200 strands a paying customer on Free.
 * It must also forget the event id on that path, or the retry is swallowed as
 * a duplicate by the idempotency table.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  event: null as unknown,
  user: undefined as { id: string; matchedBy: string } | undefined,
  lookups: [] as unknown[],
  upserts: [] as unknown[],
  forgotten: 0,
}));

vi.mock("@polar-sh/sdk/webhooks", () => ({ validateEvent: () => H.event }));
vi.mock("@/lib/env", () => ({ env: () => ({ POLAR_WEBHOOK_SECRET: "whsec" }) }));
vi.mock("@/db/schema", () => ({ userProfiles: {}, audits: {}, webhookEvents: { eventId: "event_id" } }));
vi.mock("@/db", () => ({
  db: {
    delete: () => ({
      where: async () => {
        H.forgotten++;
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock("@/lib/polar", () => ({
  rememberEventOnce: async () => true,
  isActiveSubscriptionStatus: (s: string) => ["active", "trialing", "past_due"].includes(s),
  findUserForSubscription: async (opts: unknown) => {
    H.lookups.push(opts);
    return H.user;
  },
  upsertProSubscription: async (opts: unknown) => {
    H.upserts.push(opts);
  },
}));
vi.mock("@/lib/monitoring", () => ({ ensureMonitoredDomainForUser: vi.fn() }));
vi.mock("@/lib/analytics/track.server", () => ({
  trackServer: vi.fn(async () => undefined),
  identifyServer: vi.fn(async () => undefined),
  revenueServer: vi.fn(async () => undefined),
}));

const { POST } = await import("@/app/api/webhooks/polar/route");

function subEvent(type: string, data: Record<string, unknown>) {
  return {
    type,
    data: {
      id: "sub_1",
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: "2026-12-01T00:00:00Z",
      recurringInterval: "month",
      amount: 1900,
      currency: "usd",
      customer: { id: "cus_1", email: "Buyer@X.com" },
      metadata: { userId: "u1" },
      ...data,
    },
  };
}

function post(): Promise<Response> {
  return POST(new Request("http://x/api/webhooks/polar", {
    method: "POST",
    headers: { "webhook-id": "evt_1" },
    body: "{}",
  }));
}

beforeEach(() => {
  H.user = undefined;
  H.lookups = [];
  H.upserts = [];
  H.forgotten = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("polar webhook user resolution", () => {
  it("looks the user up by metadata userId and customer email, then stores state", async () => {
    H.user = { id: "u1", matchedBy: "metadata" };
    H.event = subEvent("subscription.updated", { status: "past_due", cancelAtPeriodEnd: false });
    const res = await post();
    expect(res.status).toBe(200);
    expect(H.lookups).toEqual([{ metadataUserId: "u1", email: "Buyer@X.com" }]);
    expect(H.upserts).toEqual([
      expect.objectContaining({
        userId: "u1",
        plan: "pro",
        polarCustomerId: "cus_1",
        subscriptionStatus: "past_due",
        cancelAtPeriodEnd: false,
      }),
    ]);
  });

  it("returns 500, logs, and forgets the event id when a paid subscription has no user", async () => {
    H.event = subEvent("subscription.created", {});
    const res = await post();
    expect(res.status).toBe(500);
    expect(H.forgotten).toBe(1);
    expect(H.upserts).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("no local user"),
      expect.objectContaining({ webhookId: "evt_1", type: "subscription.created" }),
    );
  });

  it("acknowledges a non-paying state for an unknown user (nothing to retry)", async () => {
    H.event = subEvent("subscription.updated", { status: "canceled" });
    const res = await post();
    expect(res.status).toBe(200);
    expect(H.forgotten).toBe(0);
  });

  it("acknowledges a revoke for a user that was deleted", async () => {
    H.event = subEvent("subscription.revoked", { status: "canceled" });
    const res = await post();
    expect(res.status).toBe(200);
  });
});
