import { describe, it, expect } from "vitest";
import { publicSlug } from "@/lib/slug";

describe("publicSlug", () => {
  it("produces 10-char strings", () => {
    expect(publicSlug()).toHaveLength(10);
  });
  it("uses only safe alphabet (no 0/O/1/l/I)", () => {
    for (let i = 0; i < 1000; i++) {
      expect(publicSlug()).toMatch(/^[2-9a-kmnp-zA-HJ-NP-Z]{10}$/);
    }
  });
  it("is unique across 10k draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(publicSlug());
    expect(seen.size).toBe(10_000);
  });
});
