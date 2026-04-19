import { describe, it, expect, beforeEach } from "vitest";
import { bumpRateLimit, __setDbForTests } from "@/lib/rate-limit";

describe("bumpRateLimit", () => {
  let counts: Map<string, number>;
  beforeEach(() => {
    counts = new Map();
    __setDbForTests({
      async runBump(key: string): Promise<number> {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
    });
  });

  it("allows under the limit", async () => {
    expect(await bumpRateLimit("k1", 3)).toEqual({ allowed: true, count: 1 });
  });

  it("denies at/over the limit", async () => {
    counts.set("k1", 3);
    const r = await bumpRateLimit("k1", 3);
    expect(r.allowed).toBe(false);
    expect(r.count).toBe(4);
  });
});
