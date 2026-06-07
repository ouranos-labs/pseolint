import { describe, it, expect } from "vitest";
import { generateMcpToken, hashMcpToken, mcpTokenPrefix, TOKEN_RE } from "./mcp-keys";

describe("mcp token helpers", () => {
  it("generates a prefixed, high-entropy, url-safe token", () => {
    const a = generateMcpToken();
    const b = generateMcpToken();
    expect(a).toMatch(TOKEN_RE);
    expect(a.startsWith("pseo_")).toBe(true);
    expect(a).not.toEqual(b); // random
    expect(a.length).toBe(48); // 5 (pseo_) + 43 (base64url 32 bytes)
  });

  it("hashes deterministically and differs per token", () => {
    const t = generateMcpToken();
    expect(hashMcpToken(t)).toEqual(hashMcpToken(t));
    expect(hashMcpToken(t)).not.toEqual(hashMcpToken(generateMcpToken()));
    expect(hashMcpToken(t)).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
  });

  it("prefix is the first 8 chars of the token body for display", () => {
    const t = "pseo_abcdefghIJKLMNOP";
    expect(mcpTokenPrefix(t)).toBe("abcdefgh");
  });

  it("TOKEN_RE rejects malformed tokens", () => {
    expect(TOKEN_RE.test("nope")).toBe(false);
    expect(TOKEN_RE.test("pseo_")).toBe(false);
    expect(TOKEN_RE.test("pseo_with space")).toBe(false);
  });

  it("mcpTokenPrefix throws on a malformed token", () => {
    expect(() => mcpTokenPrefix("nope")).toThrow();
    expect(() => mcpTokenPrefix("pseo_")).toThrow();
  });
});
