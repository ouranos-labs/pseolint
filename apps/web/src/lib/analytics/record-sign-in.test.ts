import { describe, it, expect, vi, beforeEach } from "vitest";

const { identifyServer, trackServer } = vi.hoisted(() => ({
  identifyServer: vi.fn(),
  trackServer: vi.fn(),
}));
vi.mock("./track.server", () => ({ identifyServer, trackServer }));

const { getPlan } = vi.hoisted(() => ({ getPlan: vi.fn() }));
vi.mock("@/lib/plan", () => ({ getPlan }));

const { selectChain } = vi.hoisted(() => {
  const selectChain = { from: () => selectChain, where: () => selectChain, limit: vi.fn() };
  return { selectChain };
});
vi.mock("@/db", () => ({ db: { select: () => selectChain }, schema: {} }));
vi.mock("@/db/schema", () => ({ users: {} }));

import { recordSignIn } from "./record-sign-in";

beforeEach(() => {
  identifyServer.mockReset();
  trackServer.mockReset(); getPlan.mockReset(); selectChain.limit.mockReset();
});

describe("recordSignIn", () => {
  it("identifies with the current plan and tracks signed_in (new user)", async () => {
    getPlan.mockResolvedValue("free");
    selectChain.limit.mockResolvedValue([{ email: "a@b.com", createdAt: new Date() }]);

    await recordSignIn("user_1");

    expect(identifyServer).toHaveBeenCalledWith({ profileId: "user_1", email: "a@b.com", properties: { plan: "free" } });
    expect(trackServer).toHaveBeenCalledWith({ name: "signed_in", props: { isNewUser: true } }, { profileId: "user_1" });
  });

  it("marks a returning user and carries their current plan", async () => {
    getPlan.mockResolvedValue("pro");
    selectChain.limit.mockResolvedValue([{ email: "a@b.com", createdAt: new Date(Date.now() - 5 * 86_400_000) }]);

    await recordSignIn("user_2");

    expect(identifyServer).toHaveBeenCalledWith({ profileId: "user_2", email: "a@b.com", properties: { plan: "pro" } });
    expect(trackServer).toHaveBeenCalledWith({ name: "signed_in", props: { isNewUser: false } }, { profileId: "user_2" });
  });
});
