import { describe, it, expect } from "vitest";
import { cacheKeyFor } from "../src/cache.js";

describe("cacheKeyFor", () => {
  it("produces a 64-char hex string", () => {
    const key = cacheKeyFor("https://example.com/page");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(cacheKeyFor("https://example.com/page")).toBe(
      cacheKeyFor("https://example.com/page")
    );
  });

  it("differs for different URLs", () => {
    expect(cacheKeyFor("https://example.com/a")).not.toBe(
      cacheKeyFor("https://example.com/b")
    );
  });
});
