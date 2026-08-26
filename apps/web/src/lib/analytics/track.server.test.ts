import { describe, it, expect, vi, beforeEach } from "vitest";

const { trackRaw, identifyRaw, revenueRaw } = vi.hoisted(() => ({
  trackRaw: vi.fn(),
  identifyRaw: vi.fn(),
  revenueRaw: vi.fn(),
}));
vi.mock("./op-transport.server", () => ({ trackRaw, identifyRaw, revenueRaw }));

import { trackServer, identifyServer, revenueServer } from "./track.server";

beforeEach(() => { trackRaw.mockReset(); identifyRaw.mockReset(); revenueRaw.mockReset(); });

describe("track.server bindings", () => {
  it("forwards a catalog event's name + props + profileId to trackRaw", async () => {
    await trackServer(
      { name: "audit_completed", props: { host: "x.com", score: 42, pageCount: 10, findingCount: 3, durationMs: 1000, classification: "directory", truncated: false, authed: true, trigger: "user" } },
      { profileId: "user_9" },
    );
    expect(trackRaw).toHaveBeenCalledWith(
      "audit_completed",
      { host: "x.com", score: 42, pageCount: 10, findingCount: 3, durationMs: 1000, classification: "directory", truncated: false, authed: true, trigger: "user" },
      "user_9",
    );
  });

  it("passes undefined profileId for a propless event with no opts", async () => {
    await trackServer({ name: "gsc_connected" });
    expect(trackRaw).toHaveBeenCalledWith("gsc_connected", {}, undefined);
  });

  it("delegates identify", async () => {
    await identifyServer({ profileId: "u", email: "a@b.com", properties: { plan: "pro" } });
    expect(identifyRaw).toHaveBeenCalledWith({ profileId: "u", email: "a@b.com", properties: { plan: "pro" } });
  });

  it("forwards revenue amount, props, and profileId", async () => {
    await revenueServer(19, { currency: "usd", interval: "monthly" }, { profileId: "u" });
    expect(revenueRaw).toHaveBeenCalledWith(19, { currency: "usd", interval: "monthly" }, "u");
  });
});
