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

import { rememberEventOnce } from "@/lib/polar";

describe("rememberEventOnce idempotency", () => {
  it("first call inserts; duplicate returns false", async () => {
    expect(await rememberEventOnce("e1")).toBe(true);
    expect(await rememberEventOnce("e1")).toBe(false);
  });
});
