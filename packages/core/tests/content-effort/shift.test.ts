import { describe, it, expect } from "vitest";
import { shiftVerdict } from "../../src/auditor.js";

describe("shiftVerdict (shared bounded moderator)", () => {
  it("escalates on low effort (<= strictAt) by `cap` tiers", () => {
    expect(shiftVerdict("ready", { score: 5, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
    expect(shiftVerdict("caution", { score: 5, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("concerning");
    expect(shiftVerdict("ready", { score: 5, lenientAt: 60, strictAt: 25, cap: 2 })).toBe("concerning");
  });

  it("softens on high effort (>= lenientAt) by `cap` tiers", () => {
    expect(shiftVerdict("concerning", { score: 80, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
    expect(shiftVerdict("critical", { score: 80, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("concerning");
    expect(shiftVerdict("critical", { score: 80, lenientAt: 60, strictAt: 25, cap: 2 })).toBe("caution");
  });

  it("mid-band score = no shift", () => {
    expect(shiftVerdict("caution", { score: 40, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
    expect(shiftVerdict("concerning", { score: 50, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("concerning");
  });

  it("clamps at the ladder ends", () => {
    // high effort cannot push below "ready"
    expect(shiftVerdict("ready", { score: 80, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("ready");
    // low effort cannot push above "critical"
    expect(shiftVerdict("critical", { score: 5, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("critical");
    // cap larger than ladder still clamps
    expect(shiftVerdict("ready", { score: 80, lenientAt: 60, strictAt: 25, cap: 9 })).toBe("ready");
    expect(shiftVerdict("ready", { score: 5, lenientAt: 60, strictAt: 25, cap: 9 })).toBe("critical");
  });

  it("treats undefined / null / non-finite / out-of-range score as a no-op (absent signal)", () => {
    expect(shiftVerdict("caution", { score: undefined, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
    expect(shiftVerdict("caution", { score: null, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
    expect(shiftVerdict("caution", { score: NaN, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
    expect(shiftVerdict("caution", { score: Infinity, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
    expect(shiftVerdict("caution", { score: -1, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
    expect(shiftVerdict("caution", { score: 101, lenientAt: 60, strictAt: 25, cap: 1 })).toBe("caution");
  });

  it("preserves authority's exact +/-1 / 80 / 30 behavior when used as a caller", () => {
    // authority is shiftVerdict(v, { score, lenientAt: 80, strictAt: 30, cap: 1 })
    expect(shiftVerdict("concerning", { score: 80, lenientAt: 80, strictAt: 30, cap: 1 })).toBe("caution"); // >=80 lenient
    expect(shiftVerdict("caution", { score: 30, lenientAt: 80, strictAt: 30, cap: 1 })).toBe("concerning"); // <=30 strict
    expect(shiftVerdict("caution", { score: 50, lenientAt: 80, strictAt: 30, cap: 1 })).toBe("caution"); // mid = no shift
  });
});
