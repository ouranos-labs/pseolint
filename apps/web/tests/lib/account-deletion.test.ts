/**
 * Account deletion must end billing first and abort if it can't: a deleted
 * user can no longer sign in to cancel, so a surviving subscription would keep
 * charging them. These tests pin the order (revoke -> R2 -> user row) and that
 * a Polar failure deletes nothing at all.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  log: [] as string[],
  revokeFails: false,
  profile: [{ polarCustomerId: "cus_1" }] as Array<{ polarCustomerId: string | null }>,
  audits: [{ storageKey: "reports/a.json" }, { storageKey: null }] as Array<{ storageKey: string | null }>,
}));

vi.mock("@/db/schema", () => ({
  audits: { __t: "audits", userId: "user_id", storageKey: "storage_key" },
  userProfiles: { __t: "profiles", userId: "user_id", polarCustomerId: "polar_customer_id" },
  users: { __t: "users", id: "id" },
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: (t: { __t: string }) => {
        const rows = t.__t === "profiles" ? H.profile : H.audits;
        const where = () => Object.assign(Promise.resolve(rows), { limit: async () => rows });
        return { where };
      },
    }),
    delete: (t: { __t: string }) => ({
      where: async () => {
        H.log.push(`delete:${t.__t}`);
      },
    }),
  },
}));

vi.mock("@/lib/r2", () => ({
  deleteReport: vi.fn(async (key: string) => {
    H.log.push(`r2:${key}`);
  }),
}));

vi.mock("@/lib/polar", () => ({
  revokeUserSubscriptions: vi.fn(async (opts: { userId: string; polarCustomerId: string | null }) => {
    H.log.push(`revoke:${opts.userId}:${opts.polarCustomerId}`);
    if (H.revokeFails) throw new Error("polar 500");
    return { revoked: 1 };
  }),
}));

import { deleteUserAccount, BillingCancelError } from "@/lib/account-deletion";

beforeEach(() => {
  H.log = [];
  H.revokeFails = false;
  H.profile = [{ polarCustomerId: "cus_1" }];
});

describe("deleteUserAccount", () => {
  it("revokes the subscription, then deletes reports, then the user row", async () => {
    const res = await deleteUserAccount("u1");
    expect(res).toEqual({ revokedSubscriptions: 1 });
    expect(H.log).toEqual([
      "revoke:u1:cus_1",
      "r2:reports/a.json",
      "r2:reports/a.html",
      "delete:users",
    ]);
  });

  it("passes a null customer id when the user never had a profile", async () => {
    H.profile = [];
    await deleteUserAccount("u2");
    expect(H.log[0]).toBe("revoke:u2:null");
  });

  it("aborts with BillingCancelError and deletes nothing when Polar fails", async () => {
    H.revokeFails = true;
    await expect(deleteUserAccount("u1")).rejects.toBeInstanceOf(BillingCancelError);
    expect(H.log).toEqual(["revoke:u1:cus_1"]);
  });
});
