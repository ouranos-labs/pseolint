import { describe, it, expect, vi, beforeEach } from "vitest";

const { cookieGet } = vi.hoisted(() => ({ cookieGet: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: cookieGet })) }));

const { identifyServer, aliasServer, trackServer } = vi.hoisted(() => ({
  identifyServer: vi.fn(),
  aliasServer: vi.fn(),
  trackServer: vi.fn(),
}));
vi.mock("./track.server", () => ({ identifyServer, aliasServer, trackServer }));

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
  cookieGet.mockReset(); identifyServer.mockReset(); aliasServer.mockReset();
  trackServer.mockReset(); getPlan.mockReset(); selectChain.limit.mockReset();
});

describe("recordSignIn", () => {
  it("identifies, aliases the anon id, and tracks signed_in (new user)", async () => {
    cookieGet.mockReturnValue({ value: "abcdefghijklmnopqrstu" }); // 21 chars
    getPlan.mockResolvedValue("free");
    selectChain.limit.mockResolvedValue([{ email: "a@b.com", createdAt: new Date() }]);

    await recordSignIn("user_1");

    expect(identifyServer).toHaveBeenCalledWith({ profileId: "user_1", email: "a@b.com", properties: { plan: "free" } });
    expect(aliasServer).toHaveBeenCalledWith({ profileId: "user_1", alias: "abcdefghijklmnopqrstu" });
    expect(trackServer).toHaveBeenCalledWith({ name: "signed_in", props: { isNewUser: true } }, { profileId: "user_1" });
  });

  it("skips alias when there is no anon cookie, and marks returning user", async () => {
    cookieGet.mockReturnValue(undefined);
    getPlan.mockResolvedValue("pro");
    selectChain.limit.mockResolvedValue([{ email: "a@b.com", createdAt: new Date(Date.now() - 5 * 86_400_000) }]);

    await recordSignIn("user_2");

    expect(aliasServer).not.toHaveBeenCalled();
    expect(trackServer).toHaveBeenCalledWith({ name: "signed_in", props: { isNewUser: false } }, { profileId: "user_2" });
  });
});
