import { describe, it, expect } from "vitest";
import { shiftVerdictForEffort } from "../../src/auditor.js";

// content-effort as a recall DRIVER (v0.7.4). Calibration showed a clean gap:
// lowest reputable effort ≈4 (wise), leaking AI farms sit at 1–3. So effort ≤3
// is a "no-reputable zone" where a 2-tier escalation flags a farm on its own,
// while effort 4–5 keeps the conservative ±1 nudge that protects winners.
describe("shiftVerdictForEffort", () => {
  it("very-low effort (≤3) escalates TWO tiers — flags a farm on its own", () => {
    expect(shiftVerdictForEffort("ready", 2)).toBe("concerning"); // healthyceleb case
    expect(shiftVerdictForEffort("ready", 0)).toBe("concerning");
    expect(shiftVerdictForEffort("caution", 1)).toBe("critical"); // popularnetworth case
  });

  it("FP-safety boundary: effort 4–5 escalates only ONE tier (protects wise≈4)", () => {
    expect(shiftVerdictForEffort("caution", 4)).toBe("concerning"); // wise: still ≤ its ceiling
    expect(shiftVerdictForEffort("ready", 4)).toBe("caution"); // NOT concerning
    expect(shiftVerdictForEffort("ready", 5)).toBe("caution");
  });

  it("mid effort (6–24) does not move the verdict", () => {
    expect(shiftVerdictForEffort("ready", 9)).toBe("ready"); // wikibioworth — correctly not flagged
    expect(shiftVerdictForEffort("caution", 12)).toBe("caution");
  });

  it("high effort (≥25) softens one tier — rescues proprietary-data winners", () => {
    expect(shiftVerdictForEffort("concerning", 28)).toBe("caution"); // numbeo case
    expect(shiftVerdictForEffort("critical", 100)).toBe("concerning");
  });

  it("escalation/softening saturate at the ladder ends", () => {
    expect(shiftVerdictForEffort("concerning", 1)).toBe("critical"); // +2 caps at critical
    expect(shiftVerdictForEffort("ready", 50)).toBe("ready"); // soften floors at ready
  });

  it("absent / out-of-range score leaves the verdict untouched (fail-safe)", () => {
    expect(shiftVerdictForEffort("ready", undefined)).toBe("ready");
    expect(shiftVerdictForEffort("caution", null)).toBe("caution");
    expect(shiftVerdictForEffort("ready", -1)).toBe("ready");
    expect(shiftVerdictForEffort("ready", 101)).toBe("ready");
  });
});
