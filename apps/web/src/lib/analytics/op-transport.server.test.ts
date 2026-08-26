import { describe, it, expect, vi, beforeEach } from "vitest";

const trackMock = vi.fn();
const identifyMock = vi.fn();
const revenueMock = vi.fn();
vi.mock("@openpanel/sdk", () => ({
  OpenPanel: vi.fn().mockImplementation(function () { return { track: trackMock, identify: identifyMock, revenue: revenueMock }; }),
}));

import { OpenPanel } from "@openpanel/sdk";
import { __resetEnvCache } from "@/lib/env";
import { getAnalyticsClient, trackRaw, revenueRaw, __resetAnalyticsClient } from "./op-transport.server";

const OP = vi.mocked(OpenPanel);

function setKeys(on: boolean): void {
  if (on) {
    process.env.OPENPANEL_CLIENT_ID = "cid";
    process.env.OPENPANEL_CLIENT_SECRET = "csecret";
    process.env.OPENPANEL_API_URL = "https://op.example.com";
  } else {
    delete process.env.OPENPANEL_CLIENT_ID;
    delete process.env.OPENPANEL_CLIENT_SECRET;
    delete process.env.OPENPANEL_API_URL;
  }
  __resetEnvCache();
  __resetAnalyticsClient();
}

beforeEach(() => {
  trackMock.mockReset();
  revenueMock.mockReset();
  OP.mockClear();
});

describe("op-transport.server", () => {
  it("is a no-op when keys are unset (no client constructed)", async () => {
    setKeys(false);
    expect(getAnalyticsClient()).toBeNull();
    await trackRaw("audit_created", { host: "x.com" }, "user_1");
    expect(OP).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("constructs the client once and forwards name, props, and profileId", async () => {
    setKeys(true);
    await trackRaw("audit_created", { host: "x.com", cached: false }, "user_1");
    await trackRaw("audit_failed", { host: "x.com" });
    expect(OP).toHaveBeenCalledTimes(1); // singleton
    expect(OP).toHaveBeenCalledWith({ clientId: "cid", clientSecret: "csecret", apiUrl: "https://op.example.com" });
    expect(trackMock).toHaveBeenNthCalledWith(1, "audit_created", { host: "x.com", cached: false, profileId: "user_1" });
    expect(trackMock).toHaveBeenNthCalledWith(2, "audit_failed", { host: "x.com" });
  });

  it("forwards revenue with the profileId folded into properties", async () => {
    setKeys(true);
    await revenueRaw(19, { currency: "usd" }, "user_1");
    expect(revenueMock).toHaveBeenCalledWith(19, { currency: "usd", profileId: "user_1" });
  });

  it("never throws when the SDK throws", async () => {
    setKeys(true);
    trackMock.mockImplementationOnce(() => { throw new Error("network"); });
    await expect(trackRaw("audit_created", { host: "x.com" }, "u")).resolves.toBeUndefined();
  });
});
