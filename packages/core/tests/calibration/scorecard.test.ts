import { describe, test, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = resolve(__dirname, "../../calibration/baseline-scorecard.json");

describe("committed scorecard baseline", () => {
  test("baseline-scorecard.json exists and is well-formed", () => {
    expect(existsSync(BASELINE_PATH)).toBe(true);
    const b = JSON.parse(readFileSync(BASELINE_PATH, "utf-8"));
    expect(b.scorecard).toBeDefined();
    const c = b.scorecard.confusion;
    expect(c).toHaveProperty("tp");
    expect(c).toHaveProperty("recall");
    const labeled = b.scorecard.classCounts.reputable + b.scorecard.classCounts.policyViolating;
    // every labeled audited site lands in exactly one confusion cell; subjects excluded
    expect(c.tp + c.fp + c.tn + c.fn).toBe(labeled);
    for (const k of ["precision", "recall", "f1"]) expect(Number.isFinite(c[k])).toBe(true);
    expect(typeof b.perSiteVerdict).toBe("object");
  });
});
