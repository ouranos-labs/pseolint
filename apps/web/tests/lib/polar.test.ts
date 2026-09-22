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

vi.mock("@polar-sh/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@polar-sh/sdk")>();
  return {
    ...actual,
    Polar: vi.fn(function () {}),
  };
});

import {
  rememberEventOnce,
  isActiveSubscriptionStatus,
  POLAR_API_VERSION,
  createPolarHttpClient,
} from "@/lib/polar";

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

describe("Polar API version pinning", () => {
  it("pins API version to 2026-04", () => {
    expect(POLAR_API_VERSION).toBe("2026-04");
  });

  it("createPolarHttpClient attaches Polar-Version header to outgoing requests", async () => {
    const client = createPolarHttpClient();
    let capturedHeader: string | null = null;
    (client as unknown as { fetcher: (req: Request) => Promise<Response> }).fetcher = async (req: Request) => {
      capturedHeader = req.headers.get("Polar-Version");
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await client.request(new Request("https://api.polar.sh/v1/checkouts"));
    expect(capturedHeader).toBe("2026-04");
  });
});

