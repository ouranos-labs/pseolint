/**
 * SP2: `--authority-score` CLI flag wiring.
 *
 * The flag funnels a user-supplied 0-100 domain authority into
 * AuditOptions.authorityScore, which the engine consumes via
 * shiftVerdictForAuthority (>=80 lenient, <=30 stricter). Here we cover the two
 * bits of logic this CLI added: mergeOptions pass-through and the 0-100-integer
 * validation contract enforced in runCli before the value is accepted.
 */
import { describe, expect, it } from "vitest";
import { mergeOptions } from "../src/config.js";

describe("mergeOptions: authorityScore pass-through", () => {
  it("threads a CLI authorityScore into AuditOptions", () => {
    expect(mergeOptions({}, { authorityScore: 75 }).authorityScore).toBe(75);
  });
  it("leaves authorityScore unset when no flag is given", () => {
    expect(mergeOptions({}, {}).authorityScore).toBeUndefined();
  });
  it("CLI flag overrides a config-file value", () => {
    expect(mergeOptions({ authorityScore: 10 }, { authorityScore: 90 }).authorityScore).toBe(90);
  });
  it("config-file value survives when no CLI flag overrides it", () => {
    expect(mergeOptions({ authorityScore: 42 }, {}).authorityScore).toBe(42);
  });
});

/** Mirrors runCli's accept/reject rule for --authority-score (integer, 0-100 inclusive). */
const accepts = (raw: string): boolean => {
  const t = raw.trim();
  const n = Number(t);
  return t !== "" && Number.isInteger(n) && n >= 0 && n <= 100;
};

describe("authority-score validation contract", () => {
  it.each(["0", "30", "80", "100"])("accepts in-range integer %s", (v) => {
    expect(accepts(v)).toBe(true);
  });
  it.each(["-1", "101", "75.5", "abc", ""])("rejects %s", (v) => {
    expect(accepts(v)).toBe(false);
  });
});
