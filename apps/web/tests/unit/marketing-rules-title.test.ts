/**
 * Producer/consumer contract for rule short names.
 *
 * `/rules` cards and the `/rules/[ruleId]` sibling nav render only the short
 * name, obtained by splitting `title` on its separator. Producer (the title
 * strings in lib/marketing-rules.ts) and consumer (`ruleShortTitle`) have to
 * agree on that separator: when they drifted apart, the split silently stopped
 * firing and the full ~60-char title rendered in every card <h2> instead.
 *
 * Nothing about that failure is visible to a type checker, so assert it here
 * against the real MARKETING_RULES data.
 */
import { describe, it, expect } from "vitest";
import { MARKETING_RULES, ruleShortTitle } from "@/lib/marketing-rules";

describe("ruleShortTitle", () => {
  it("actually shortens every real rule title", () => {
    const unsplit = MARKETING_RULES.filter((r) => ruleShortTitle(r.title) === r.title).map(
      (r) => r.slug,
    );
    // A title with no separator would render in full in the card <h2>.
    expect(unsplit).toEqual([]);
  });

  it("produces a short name for every rule", () => {
    for (const rule of MARKETING_RULES) {
      const short = ruleShortTitle(rule.title);
      expect(short.length, `${rule.slug}: "${short}"`).toBeGreaterThan(0);
      // Card headings are single-line; the descriptive clause belongs to the
      // full title, not the short name.
      expect(short.length, `${rule.slug}: "${short}"`).toBeLessThanOrEqual(40);
      expect(short, rule.slug).toBe(short.trim());
    }
  });

  it("falls back to the whole title when there is no separator", () => {
    expect(ruleShortTitle("Orphan Pages")).toBe("Orphan Pages");
    expect(ruleShortTitle("  Orphan Pages  ")).toBe("Orphan Pages");
  });

  it("keeps only the text before the first separator", () => {
    expect(ruleShortTitle("Thin Content Detection: How Google Catches It")).toBe(
      "Thin Content Detection",
    );
    expect(ruleShortTitle("llms.txt: A Draft Convention: With Two Colons")).toBe("llms.txt");
  });
});
