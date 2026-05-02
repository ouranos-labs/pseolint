import { describe, it, expect } from "vitest";
import { CORE_RULESET_VERSION } from "../src/ruleset-version.js";

describe("CORE_RULESET_VERSION", () => {
  it("is a non-empty string", () => {
    expect(typeof CORE_RULESET_VERSION).toBe("string");
    expect(CORE_RULESET_VERSION.length).toBeGreaterThan(0);
  });
});
