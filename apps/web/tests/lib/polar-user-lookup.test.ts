/**
 * findUserForSubscription is how the Polar webhook ties a paid subscription to a
 * local user. metadata.userId (set at checkout) must win over email, and email
 * is only a fallback, so a buyer who types a different address into Polar's
 * form still gets their plan.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Each db.select() chain resolves to the next queued result, in call order.
const H = vi.hoisted(() => ({ results: [] as Array<Array<{ id: string }>>, calls: 0 }));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            H.calls++;
            return H.results.shift() ?? [];
          },
        }),
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({ users: { id: "id", email: "email" }, userProfiles: {}, webhookEvents: {} }));
vi.mock("@polar-sh/sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@polar-sh/sdk")>()),
  Polar: vi.fn(function () {}),
}));

import { findUserForSubscription } from "@/lib/polar";

beforeEach(() => {
  H.results = [];
  H.calls = 0;
});

describe("findUserForSubscription", () => {
  it("matches by metadata userId without touching email", async () => {
    H.results = [[{ id: "u1" }]];
    const u = await findUserForSubscription({ metadataUserId: "u1", email: "other@x.com" });
    expect(u).toEqual({ id: "u1", matchedBy: "metadata" });
    expect(H.calls).toBe(1);
  });

  it("falls back to email when the metadata userId has no row", async () => {
    H.results = [[], [{ id: "u2" }]];
    const u = await findUserForSubscription({ metadataUserId: "gone", email: "Alice@X.com" });
    expect(u).toEqual({ id: "u2", matchedBy: "email" });
    expect(H.calls).toBe(2);
  });

  it("uses email alone when there is no metadata", async () => {
    H.results = [[{ id: "u3" }]];
    expect(await findUserForSubscription({ email: "a@x.com" })).toEqual({ id: "u3", matchedBy: "email" });
  });

  it("returns undefined when nothing matches", async () => {
    expect(await findUserForSubscription({ metadataUserId: "nope", email: "nope@x.com" })).toBeUndefined();
    expect(await findUserForSubscription({})).toBeUndefined();
  });
});
