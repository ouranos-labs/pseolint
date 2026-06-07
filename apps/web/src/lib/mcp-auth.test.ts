import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./mcp-keys", () => ({ verifyMcpKey: vi.fn() }));

import { verifyMcpKey } from "./mcp-keys";
import { resolveMcpIdentity } from "./mcp-auth";

const verify = vi.mocked(verifyMcpKey);

function req(headers: Record<string, string>): Request {
  return new Request("https://pseolint.dev/api/mcp", { method: "POST", headers });
}

describe("resolveMcpIdentity", () => {
  beforeEach(() => verify.mockReset());

  it("returns anon identity with client IP when no Authorization header", async () => {
    const id = await resolveMcpIdentity(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(id).toEqual({ kind: "anon", ip: "203.0.113.7" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns key identity for a valid Bearer token", async () => {
    verify.mockResolvedValue({ userId: "user_123" });
    const id = await resolveMcpIdentity(req({ authorization: "Bearer pseo_validtoken" }));
    expect(id).toEqual({ kind: "key", userId: "user_123" });
    expect(verify).toHaveBeenCalledWith("pseo_validtoken");
  });

  it("returns invalid for a Bearer token that fails verification", async () => {
    verify.mockResolvedValue(null);
    const id = await resolveMcpIdentity(req({ authorization: "Bearer pseo_bad" }));
    expect(id).toEqual({ kind: "invalid" });
  });

  it("treats a non-Bearer Authorization header as invalid", async () => {
    const id = await resolveMcpIdentity(req({ authorization: "Basic abc" }));
    expect(id).toEqual({ kind: "invalid" });
    expect(verify).not.toHaveBeenCalled();
  });
});
