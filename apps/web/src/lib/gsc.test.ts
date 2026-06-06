import { describe, it, expect } from "vitest";
import { weekBucketUtc } from "@/lib/gsc";

describe("weekBucketUtc", () => {
  it("formats an ISO week key as YYYY-Www (UTC)", () => {
    // 2026-01-05 is a Monday in ISO week 2 of 2026.
    expect(weekBucketUtc(new Date("2026-01-05T00:00:00Z"))).toBe("2026-W02");
  });

  it("zero-pads single-digit weeks", () => {
    // 2026-01-01 falls in ISO week 1.
    expect(weekBucketUtc(new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
  });

  it("assigns late-December dates to the correct ISO week-year", () => {
    // 2024-12-30 is ISO week 1 of 2025 (ISO weeks belong to the year of their Thursday).
    expect(weekBucketUtc(new Date("2024-12-30T00:00:00Z"))).toBe("2025-W01");
  });
});
