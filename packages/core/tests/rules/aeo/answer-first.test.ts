import { describe, expect, test } from "vitest";
import { answerFirstRule, extractFirstParagraph } from "../../../src/rules/aeo/answer-first.js";
import type { EntityMaskPattern } from "../../../src/types.js";
import { page } from "./page-fixture.js";

const STATE_MASK: EntityMaskPattern[] = [
  { placeholder: "[STATE]", pattern: /\b(California|Texas|New York|Florida)\b/gi },
];

describe("extractFirstParagraph", () => {
  test("picks the first <p> after the <h1>", () => {
    const html = `
      <h1>LLC Filing</h1>
      <p>California LLC filing fee is $70 as of 2026 and takes 2-4 weeks.</p>
      <p>Second paragraph.</p>
    `;
    expect(extractFirstParagraph(html)).toMatch(/^California LLC/);
  });

  test("falls back to any content paragraph when no H1 siblings match", () => {
    const html = "<article><p>Hello world this is content.</p></article>";
    expect(extractFirstParagraph(html)).toBe("Hello world this is content.");
  });

  test("finds the opener when H1 is wrapped in a <header> or hero container", () => {
    const html = `
      <div class="hero">
        <header><h1>California LLC</h1></header>
      </div>
      <article>
        <p>California LLC filing fee is $70 and takes 2-4 weeks.</p>
        <p>Second paragraph should be ignored.</p>
      </article>
    `;
    expect(extractFirstParagraph(html)).toMatch(/^California LLC filing fee/);
  });

  test("skips nav/aside/footer paragraphs that appear after the H1", () => {
    const html = `
      <h1>Topic</h1>
      <nav><p>Navigate to other things in our site menu today.</p></nav>
      <aside><p>Related sidebar content links and promotional items here.</p></aside>
      <p>Actual opener content with the real answer for this page.</p>
    `;
    expect(extractFirstParagraph(html)).toMatch(/^Actual opener content/);
  });
});

describe("aeo/answer-first", () => {
  test("passes on a concrete, entity-specific opener", () => {
    const html = `
      <h1>California LLC</h1>
      <p>California LLC filing costs $70 and takes 2-4 weeks with the Secretary of State.</p>
    `;
    const p = page("https://example.dev/ca-llc", {
      html,
      headings: { h1: ["California LLC"], h2: [] },
    });
    expect(answerFirstRule([p], STATE_MASK)).toHaveLength(0);
  });

  test("errors on a boilerplate 'Generate your...' opener", () => {
    const html = `
      <h1>California LLC Template</h1>
      <p>Generate your California LLC template instantly with our free document tool.</p>
    `;
    const p = page("https://example.dev/ca-llc", {
      html,
      headings: { h1: ["California LLC Template"], h2: [] },
    });
    const findings = answerFirstRule([p], STATE_MASK);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toMatch(/boilerplate/i);
  });

  test("penalizes template openers that are identical after entity masking", () => {
    const pages = (["California", "Texas", "New York", "Florida"]).map((state) =>
      page(`https://example.dev/${state.toLowerCase().replace(" ", "-")}-llc`, {
        html: `<h1>${state} LLC</h1><p>Generate your ${state} LLC template today.</p>`,
        headings: { h1: [`${state} LLC`], h2: [] },
      }),
    );
    const findings = answerFirstRule(pages, STATE_MASK);
    // All four share a templated opener after masking → all four flagged.
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.severity === "error")).toBe(true);
  });

  test("passes when opener has a named entity + complete sentence (score >= 2)", () => {
    const html = `
      <h1>Delaware Corporation Filing</h1>
      <p>Delaware corporations are registered with the Delaware Division of Corporations office.</p>
    `;
    const p = page("https://example.dev/de-corp", {
      html,
      headings: { h1: ["Delaware Corporation Filing"], h2: [] },
    });
    expect(answerFirstRule([p], STATE_MASK)).toHaveLength(0);
  });

  test("single-word proper nouns satisfy the named-entity check (no false negatives)", () => {
    const html = `
      <h1>Delaware LLC</h1>
      <p>Delaware filing costs $70 and takes two weeks with the state office.</p>
    `;
    const p = page("https://example.dev/de-llc", {
      html,
      headings: { h1: ["Delaware LLC"], h2: [] },
    });
    // Delaware (single-word) + $70 (fact) + complete sentence → score 3, passes.
    expect(answerFirstRule([p], STATE_MASK)).toHaveLength(0);
  });

  test("user-defined entity mask pattern counts as a named entity", () => {
    const html = `
      <h1>Paris Travel</h1>
      <p>paris prices peak at $500 per night during peak tourist season months.</p>
    `;
    const cityMask = [{ placeholder: "[CITY]", pattern: /\bparis\b/gi }];
    const p = page("https://example.dev/paris", {
      html,
      headings: { h1: ["Paris Travel"], h2: [] },
    });
    // Lowercase "paris" in opener — no multi-word proper noun, no single-word capitalized
    // proper noun (starts sentence → excluded), but the user's entity mask matches → +1.
    expect(answerFirstRule([p], cityMask)).toHaveLength(0);
  });

  test("warns at score=1 — complete sentence only, no concrete facts, no named entity", () => {
    const html = `
      <h1>Filing Guide</h1>
      <p>Filing is a process that you can complete easily online with preparation.</p>
    `;
    const p = page("https://example.dev/generic", {
      html,
      headings: { h1: ["Filing Guide"], h2: [] },
    });
    const findings = answerFirstRule([p], STATE_MASK);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
  });
});
