import { describe, expect, test } from "vitest";
import { summaryBaitRule } from "../../../src/rules/aeo/summary-bait.js";
import type { EntityMaskPattern } from "../../../src/types.js";
import { page } from "./page-fixture.js";

const STATE_MASK: EntityMaskPattern[] = [
  { placeholder: "[STATE]", pattern: /\b(California|Texas|New York|Florida)\b/gi },
];

function facts(opener: string, rest = "", options: { interactive?: string; download?: string } = {}): string {
  const interactive = options.interactive ?? "";
  const download = options.download ?? "";
  return `
    <html>
      <head><title>t</title></head>
      <body>
        <h1>Page</h1>
        <p>${opener}</p>
        ${rest ? `<p>${rest}</p>` : ""}
        ${interactive}
        ${download}
      </body>
    </html>
  `;
}

describe("aeo/summary-bait", () => {
  test("fires when opener answers + no interactive value + facts packed in opener", () => {
    const html = facts(
      "California LLC filing costs $70 and takes 2-4 weeks with the Secretary of State. The fee for amendment is $30 and requires Form LLC-12.",
      "Generic boilerplate with no additional numbers, dates, or named entities anywhere.",
    );
    const text =
      "California LLC filing costs $70 and takes 2-4 weeks with the Secretary of State. " +
      "The fee for amendment is $30 and requires Form LLC-12. " +
      "Generic boilerplate with no additional numbers, dates, or named entities anywhere.";
    const p = page("https://example.dev/ca-llc", { html, contentText: text });
    const findings = summaryBaitRule([p], STATE_MASK);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toMatch(/optimized for summarization/);
    // Summary-bait is always medium confidence; it's a forecast.
    expect(findings[0].confidence).toBe("medium");
    expect(findings[0].message).toMatch(/forecast/i);
  });

  test("does not fire when page has an interactive element (calculator) above the fold", () => {
    const html = facts(
      "California LLC filing costs $70 and takes 2-4 weeks with the Secretary of State.",
      "Some more prose.",
      { interactive: '<div class="calculator"><form><input name="fee"/></form></div>' },
    );
    const p = page("https://example.dev/ca-llc", {
      html,
      contentText: "California LLC filing costs $70 and takes 2-4 weeks with the Secretary of State. Some more prose.",
    });
    expect(summaryBaitRule([p], STATE_MASK)).toHaveLength(0);
  });

  test("does not fire when a downloadable asset is present", () => {
    const html = facts(
      "California LLC filing costs $70 and takes 2-4 weeks with the Secretary of State.",
      "",
      { download: '<a href="/ca-llc-guide.pdf">Download</a>' },
    );
    const p = page("https://example.dev/ca-llc", {
      html,
      contentText: "California LLC filing costs $70 and takes 2-4 weeks with the Secretary of State.",
    });
    expect(summaryBaitRule([p], STATE_MASK)).toHaveLength(0);
  });

  test("does not fire when facts are distributed below the opener", () => {
    // Shrink the opener window so the first sentence is the opener and the
    // rest of the facts sit "below the fold" for the rule's purposes.
    const html = facts(
      "California LLC filing costs $70 and takes 2-4 weeks.",
      [
        "Annual franchise tax: $800 due every April 15.",
        "Form LLC-12 required for amendments.",
        "Processing expedited: 3 business days for $350.",
        "Late fee: 25% penalty.",
        "Biennial statement: $20 filing.",
        "Registered agent fee: varies $50-200.",
        "LLC-1 initial filing form with Secretary of State.",
        "Publication requirement: 6 weeks in two newspapers.",
      ].join(" "),
    );
    const p = page("https://example.dev/ca-llc", {
      html,
      contentText: [
        "California LLC filing costs $70 and takes 2-4 weeks.",
        "Annual franchise tax: $800 due every April 15.",
        "Form LLC-12 required for amendments.",
        "Processing expedited: 3 business days for $350.",
        "Late fee: 25% penalty.",
        "Biennial statement: $20 filing.",
        "Registered agent fee: varies $50-200.",
        "LLC-1 initial filing form with Secretary of State.",
        "Publication requirement: 6 weeks in two newspapers.",
      ].join(" "),
    });
    // openerWordCount:10 => first sentence only. 2 of ~11 facts in the opener → 18% → below 70%.
    expect(summaryBaitRule([p], STATE_MASK, { openerWordCount: 10 })).toHaveLength(0);
  });

  test("does not fire when opener itself is too weak (answer-first would already flag it)", () => {
    // Opener has no facts and isn't a complete answer: answer-first would fire.
    // summary-bait stays silent to avoid two overlapping findings.
    const html = facts(
      "Welcome to our complete guide for filing.",
      "Some more generic text without any numbers or entities.",
    );
    const p = page("https://example.dev/weak", {
      html,
      contentText:
        "Welcome to our complete guide for filing. Some more generic text without any numbers or entities.",
    });
    expect(summaryBaitRule([p], STATE_MASK)).toHaveLength(0);
  });

  test("respects minFactsToAnalyze: very-few-fact pages aren't flagged here", () => {
    // Only 1 fact total; citable-facts should handle that separately.
    const html = facts(
      "California LLC filing costs $70 and takes a long time to process.",
      "No more specific numbers here.",
    );
    const p = page("https://example.dev/thin", {
      html,
      contentText:
        "California LLC filing costs $70 and takes a long time to process. No more specific numbers here.",
    });
    expect(summaryBaitRule([p], STATE_MASK, { minFactsToAnalyze: 3 })).toHaveLength(0);
  });
});
