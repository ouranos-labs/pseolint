import { describe, expect, test } from "vitest";
import { hammingDistance, simHashFromText, similarityFromDistance } from "../../src/algorithms/simhash.js";

describe("simhash", () => {
  test("returns same fingerprint for identical text", () => {
    const a = simHashFromText("california llc filing requirements and annual fees");
    const b = simHashFromText("california llc filing requirements and annual fees");

    expect(a).toBe(b);
    expect(hammingDistance(a, b)).toBe(0);
    expect(similarityFromDistance(0)).toBe(1);
  });

  test("returns lower similarity for different text", () => {
    const a = simHashFromText("california llc filing requirements and annual fees");
    const b = simHashFromText("best sourdough starter hydration and oven spring tips");

    const distance = hammingDistance(a, b);
    expect(distance).toBeGreaterThan(10);
    expect(similarityFromDistance(distance)).toBeLessThan(0.85);
  });

  test("returns neutral fingerprint for empty input", () => {
    const fingerprint = simHashFromText("   ");
    expect(fingerprint).toBe(0n);
  });
});
