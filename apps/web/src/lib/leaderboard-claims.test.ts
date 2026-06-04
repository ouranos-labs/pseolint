import { describe, it, expect } from "vitest";
import { claimToken } from "./leaderboard-claims";

describe("claimToken", () => {
  it("is deterministic per (userId, host)", () => {
    expect(claimToken("u1", "example.com")).toBe(claimToken("u1", "example.com"));
  });
  it("differs by user and by host", () => {
    expect(claimToken("u1", "example.com")).not.toBe(claimToken("u2", "example.com"));
    expect(claimToken("u1", "example.com")).not.toBe(claimToken("u1", "other.com"));
  });
  it("is host-case-insensitive", () => {
    expect(claimToken("u1", "Example.com")).toBe(claimToken("u1", "example.com"));
  });
  it("is a short hex string", () => {
    expect(claimToken("u1", "example.com")).toMatch(/^[0-9a-f]{16}$/);
  });
});
