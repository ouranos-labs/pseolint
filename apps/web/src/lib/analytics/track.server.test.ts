import { describe, it, expect, vi, beforeEach } from "vitest";

const { trackRaw, identifyRaw, aliasRaw } = vi.hoisted(() => ({
  trackRaw: vi.fn(),
  identifyRaw: vi.fn(),
  aliasRaw: vi.fn(),
}));
vi.mock("./op-transport.server", () => ({ trackRaw, identifyRaw, aliasRaw }));

import { trackServer, identifyServer, aliasServer } from "./track.server";

beforeEach(() => { trackRaw.mockReset(); identifyRaw.mockReset(); aliasRaw.mockReset(); });

describe("track.server bindings", () => {
  it("forwards a catalog event's name + props + profileId to trackRaw", async () => {
    await trackServer(
      { name: "audit_completed", props: { host: "x.com", score: 42, pageCount: 10, findingCount: 3, durationMs: 1000, classification: "directory", truncated: false, authed: true } },
      { profileId: "user_9" },
    );
    expect(trackRaw).toHaveBeenCalledWith(
      "audit_completed",
      { host: "x.com", score: 42, pageCount: 10, findingCount: 3, durationMs: 1000, classification: "directory", truncated: false, authed: true },
      "user_9",
    );
  });

  it("passes undefined profileId for a propless event with no opts", async () => {
    await trackServer({ name: "gsc_connected" });
    expect(trackRaw).toHaveBeenCalledWith("gsc_connected", {}, undefined);
  });

  it("delegates identify and alias", async () => {
    await identifyServer({ profileId: "u", email: "a@b.com", properties: { plan: "pro" } });
    await aliasServer({ profileId: "u", alias: "anon123" });
    expect(identifyRaw).toHaveBeenCalledWith({ profileId: "u", email: "a@b.com", properties: { plan: "pro" } });
    expect(aliasRaw).toHaveBeenCalledWith({ profileId: "u", alias: "anon123" });
  });
});
