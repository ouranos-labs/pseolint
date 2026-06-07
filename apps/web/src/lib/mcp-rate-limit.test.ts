import { describe, it, expect, vi } from "vitest";
import { checkMcpRateLimit } from "./mcp-rate-limit";
import type { McpIdentity } from "./mcp-auth";

function fakeLimiter(allow: boolean) {
  return {
    limit: vi.fn(async (key: string) => ({
      success: allow,
      limit: 20,
      remaining: allow ? 19 : 0,
      reset: 1_000,
      pending: Promise.resolve(),
      _key: key,
    })),
  };
}

describe("checkMcpRateLimit", () => {
  it("uses the anon limiter keyed by hashed IP", async () => {
    const anon = fakeLimiter(true);
    const keyed = fakeLimiter(true);
    const id: McpIdentity = { kind: "anon", ip: "203.0.113.7" };
    const r = await checkMcpRateLimit(id, { anon: anon as never, keyed: keyed as never });
    expect(r.success).toBe(true);
    expect(anon.limit).toHaveBeenCalledTimes(1);
    expect(anon.limit.mock.calls[0][0]).toMatch(/^mcp:anon:[0-9a-f]{24}$/);
    expect(keyed.limit).not.toHaveBeenCalled();
  });

  it("uses the keyed limiter keyed by userId for authenticated calls", async () => {
    const anon = fakeLimiter(true);
    const keyed = fakeLimiter(true);
    const id: McpIdentity = { kind: "key", userId: "user_123" };
    await checkMcpRateLimit(id, { anon: anon as never, keyed: keyed as never });
    expect(keyed.limit).toHaveBeenCalledWith("mcp:key:user_123");
    expect(anon.limit).not.toHaveBeenCalled();
  });

  it("returns success:false with a Retry-After when over the limit", async () => {
    const futureReset = Date.now() + 42_000;
    const overLimitLimiter = {
      limit: vi.fn(async (_key: string) => ({
        success: false,
        limit: 20,
        remaining: 0,
        reset: futureReset,
        pending: Promise.resolve(),
      })),
    };
    const id: McpIdentity = { kind: "anon", ip: "203.0.113.7" };
    const r = await checkMcpRateLimit(id, { anon: overLimitLimiter as never, keyed: fakeLimiter(true) as never });
    expect(r.success).toBe(false);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
    expect(r.retryAfterSeconds).toBeLessThanOrEqual(42);
  });
});
