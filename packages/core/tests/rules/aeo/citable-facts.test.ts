import { describe, expect, test } from "vitest";
import { citableFactsRule } from "../../../src/rules/aeo/citable-facts.js";
import type { EntityMaskPattern } from "../../../src/types.js";
import { page } from "./page-fixture.js";

const NO_MASK: EntityMaskPattern[] = [];
const STATE_MASK: EntityMaskPattern[] = [
  { placeholder: "[STATE]", pattern: /\b(California|Texas|New York|Florida)\b/gi },
];

describe("aeo/citable-facts", () => {
  test("errors on pages with fewer than minFactsPerPage facts", () => {
    const p = page("https://example.dev/a", {
      contentText: "Filing fees vary by state and processing takes several weeks.",
    });
    const findings = citableFactsRule([p], NO_MASK);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    // Zero unique facts → high confidence (almost certainly content-poor).
    expect(findings[0].confidence).toBe("high");
  });

  test("emits medium confidence when count is between 1 and minFactsPerPage-1", () => {
    const p = page("https://example.dev/a", {
      contentText: "Filing is $70 and takes about a year to complete in our state.",
    });
    const findings = citableFactsRule([p], NO_MASK, { minFactsPerPage: 3, targetFactsPerPage: 8 });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].confidence).toBe("medium");
  });

  test("warns when count is between min and target (low confidence + caveat)", () => {
    const p = page("https://example.dev/a", {
      contentText:
        "Filing is $70. It takes 2-4 weeks. Annual fee is $25. Renewal by March 15, 2026.",
    });
    const findings = citableFactsRule([p], NO_MASK, { minFactsPerPage: 3, targetFactsPerPage: 8 });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].confidence).toBe("low");
    expect(findings[0].message).toMatch(/low confidence/i);
  });

  test("passes at or above targetFactsPerPage", () => {
    const p = page("https://example.dev/a", {
      contentText: [
        "Filing fee: $70.",
        "Processing: 2-4 weeks.",
        "Expedited: 3 business days for $350.",
        "Annual report: $25 by March 15.",
        "Form LLC-1 required.",
        "Renewal: every 2 years.",
        "Late fee: 25% penalty.",
        "Dissolution: $20 filing.",
      ].join(" "),
    });
    expect(citableFactsRule([p], NO_MASK, { targetFactsPerPage: 8 })).toHaveLength(0);
  });

  test("filters out template facts shared across most pages after masking", () => {
    // 10 pages where every page shares "fee of $70" (template fact) but only one has a unique fact.
    const pages = Array.from({ length: 10 }, (_, i) => {
      const state = i === 0 ? "California" : ["Texas", "New York", "Florida"][i % 3];
      return page(`https://example.dev/${state.toLowerCase()}-${i}`, {
        contentText: `${state} LLC. Filing fee is $70. Takes 14 days.${i === 0 ? " California annual report: $800." : ""}`,
      });
    });
    const findings = citableFactsRule(pages, STATE_MASK, {
      minFactsPerPage: 3,
      targetFactsPerPage: 4,
    });
    // $70 and "14 days" become template facts (appear on all 10 masked pages) so don't count.
    // Page 0 has one extra unique fact, others have zero unique facts.
    expect(findings.length).toBeGreaterThanOrEqual(9);
  });

  test("small-corpus: shared template facts are still detected on a 3-page audit", () => {
    // All three pages share "$70" and "14 days" as template facts. Pre-fix, the threshold
    // of `pages.length + 1` was unreachable so these counted as entity-specific.
    const states = ["California", "Texas", "New York"];
    const pages = states.map((state) =>
      page(`https://example.dev/${state.toLowerCase()}`, {
        contentText: `${state} LLC. Filing fee is $70. Processing takes 14 days.`,
      }),
    );
    const findings = citableFactsRule(pages, STATE_MASK, {
      minFactsPerPage: 1,
      targetFactsPerPage: 1,
    });
    // With template detection working, $70 and 14-days both become template facts. Each
    // page has 0 unique facts → all three get flagged.
    expect(findings).toHaveLength(3);
  });

  test("extracts dollar amounts, percentages, timeframes, dates, and Form numbers", () => {
    const p = page("https://example.dev/a", {
      contentText:
        "Submit Form LLC-1 with $70 fee. Processing is 2-4 weeks. Late fee is 25%. Deadline: March 15, 2026.",
    });
    expect(
      citableFactsRule([p], NO_MASK, { minFactsPerPage: 3, targetFactsPerPage: 5 }),
    ).toHaveLength(0);
  });
});
