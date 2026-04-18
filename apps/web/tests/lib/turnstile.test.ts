import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyTurnstileToken } from "@/lib/turnstile";

describe("verifyTurnstileToken", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("returns true on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }))));
    expect(await verifyTurnstileToken("token", "1.2.3.4")).toBe(true);
  });
  it("returns false on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false }))));
    expect(await verifyTurnstileToken("bad", "1.2.3.4")).toBe(false);
  });
  it("returns false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await verifyTurnstileToken("t", "1.2.3.4")).toBe(false);
  });
});
