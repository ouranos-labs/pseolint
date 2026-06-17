import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { effortCacheKey, readEffortCache, writeEffortCache } from "../../src/algorithms/content-effort/cache.js";

describe("effort cache", () => {
  it("is stable for identical text+model and differs across either", () => {
    expect(effortCacheKey("hello world", "claude-opus-4-8"))
      .toBe(effortCacheKey("hello world", "claude-opus-4-8"));
    expect(effortCacheKey("hello world", "claude-opus-4-8"))
      .not.toBe(effortCacheKey("hello world", "claude-haiku-4-5"));
  });

  it("round-trips a score to disk", async () => {
    const dir = mkdtempSync(join(tmpdir(), "eff-"));
    const key = effortCacheKey("body", "claude-opus-4-8");
    expect(await readEffortCache(dir, key)).toBeNull();
    await writeEffortCache(dir, key, 42);
    expect(await readEffortCache(dir, key)).toBe(42);
  });
});
