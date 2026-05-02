import { describe, it, expect, vi } from "vitest";

const seen = vi.hoisted<{ ids: string[] }>(() => ({ ids: [] }));

vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: async (v: { eventId: string }) => {
        if (seen.ids.includes(v.eventId)) throw new Error("dup");
        seen.ids.push(v.eventId);
      },
    }),
  },
}));

vi.mock("@/db/schema", () => ({ webhookEvents: {} }));

vi.mock("@polar-sh/sdk", () => ({
  Polar: vi.fn(function () {}),
}));

import { rememberEventOnce, isActiveSubscriptionStatus } from "@/lib/polar";

describe("rememberEventOnce idempotency", () => {
  it("first call inserts; duplicate returns false", async () => {
    expect(await rememberEventOnce("e1")).toBe(true);
    expect(await rememberEventOnce("e1")).toBe(false);
  });
});

describe("isActiveSubscriptionStatus", () => {
  it("treats active, trialing, and past_due as Pro", () => {
    expect(isActiveSubscriptionStatus("active")).toBe(true);
    expect(isActiveSubscriptionStatus("trialing")).toBe(true);
    // past_due covers Polar's renewal-retry window so transient card failures
    // don't immediately downgrade an active subscriber.
    expect(isActiveSubscriptionStatus("past_due")).toBe(true);
  });
  it("treats incomplete, unpaid, canceled, and unknown as not-Pro", () => {
    expect(isActiveSubscriptionStatus("incomplete")).toBe(false);
    expect(isActiveSubscriptionStatus("incomplete_expired")).toBe(false);
    expect(isActiveSubscriptionStatus("unpaid")).toBe(false);
    expect(isActiveSubscriptionStatus("canceled")).toBe(false);
    expect(isActiveSubscriptionStatus("nonsense")).toBe(false);
  });
});
