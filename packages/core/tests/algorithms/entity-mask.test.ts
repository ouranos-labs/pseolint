import { describe, expect, test } from "vitest";
import { maskEntities } from "../../src/algorithms/entity-mask.js";

describe("entity masking", () => {
  test("replaces matched entities with placeholders", () => {
    const input = "Form your California LLC in Los Angeles with zip 90210.";
    const output = maskEntities(input, [
      { placeholder: "[STATE]", pattern: /\bCalifornia\b/gi },
      { placeholder: "[CITY]", pattern: /\bLos Angeles\b/gi },
      { placeholder: "[ZIP]", pattern: /\b\d{5}\b/g }
    ]);

    expect(output).toContain("[STATE]");
    expect(output).toContain("[CITY]");
    expect(output).toContain("[ZIP]");
    expect(output).not.toContain("California");
    expect(output).not.toContain("90210");
  });

  test("replaces all occurrences even if regex is not global", () => {
    const input = "California LLC filing in California has California-specific rules.";
    const output = maskEntities(input, [{ placeholder: "[STATE]", pattern: /\bCalifornia\b/i }]);

    expect(output).toBe("[STATE] LLC filing in [STATE] has [STATE]-specific rules.");
  });
});
