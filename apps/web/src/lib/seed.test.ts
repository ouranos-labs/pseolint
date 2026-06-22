import { describe, it, expect } from "vitest";
import { hashToInt } from "./seed";

describe("hashToInt", () => {
  it("is stable — the same host yields the same int across calls", () => {
    expect(hashToInt("example.com")).toBe(hashToInt("example.com"));
    expect(hashToInt("paperforge.dev")).toBe(hashToInt("paperforge.dev"));
  });

  it("differs across distinct hosts", () => {
    expect(hashToInt("example.com")).not.toBe(hashToInt("example.org"));
    expect(hashToInt("a.com")).not.toBe(hashToInt("b.com"));
    expect(hashToInt("paperforge.dev")).not.toBe(hashToInt("pseolint.dev"));
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const host of ["", "x", "example.com", "very-long-subdomain.example.co.uk"]) {
      const h = hashToInt(host);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });
});
