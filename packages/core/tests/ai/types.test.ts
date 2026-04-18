import { describe, it, expect } from "vitest";
import { AdapterError } from "../../src/ai/types.js";

describe("AdapterError", () => {
  it("carries kind and message", () => {
    const err = new AdapterError("boom", "auth");
    expect(err.kind).toBe("auth");
    expect(err.message).toBe("boom");
    expect(err).toBeInstanceOf(Error);
  });

  it("preserves cause when provided", () => {
    const cause = new Error("inner");
    const err = new AdapterError("wrap", "network", cause);
    expect(err.cause).toBe(cause);
  });

  it("accepts all six kinds", () => {
    const kinds = ["auth", "network", "rate-limit", "server", "sdk-missing", "invalid-response"] as const;
    for (const k of kinds) {
      expect(new AdapterError("x", k).kind).toBe(k);
    }
  });
});
