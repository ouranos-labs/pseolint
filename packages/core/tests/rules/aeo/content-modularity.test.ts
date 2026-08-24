import { describe, expect, test } from "vitest";
import { contentModularityRule } from "../../../src/rules/aeo/content-modularity.js";
import { page } from "./page-fixture.js";

describe("aeo/content-modularity", () => {
  test("does not run on pages with fewer than 2 sections", () => {
    const p = page("https://example.dev/a", {
      html: "<html><body><p>Just one paragraph.</p></body></html>",
    });
    expect(contentModularityRule([p])).toHaveLength(0);
  });

  test("flags cross-reference language in a section", () => {
    const p = page("https://example.dev/a", {
      html: `
        <article>
          <h2>Filing Fee</h2>
          <p>The fee is $70.</p>
          <h2>Processing</h2>
          <p>As mentioned above, the fee applies here.</p>
          <h2>Renewal</h2>
          <p>Renewal every 2 years.</p>
        </article>
      `,
    });
    const findings = contentModularityRule([p], { minSelfContainedRatio: 0.9 });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/cross-references/);
    // Modularity is stylistic: always low confidence.
    expect(findings[0].confidence).toBe("low");
  });

  test("flags vague headings", () => {
    const p = page("https://example.dev/a", {
      html: `
        <article>
          <h2>California LLC Fee</h2><p>$70 fee applies.</p>
          <h2>More Info</h2><p>Some extra stuff.</p>
          <h2>Details</h2><p>Additional content.</p>
        </article>
      `,
    });
    const findings = contentModularityRule([p], { minSelfContainedRatio: 0.8 });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/too vague/);
  });

  test("flags long paragraphs", () => {
    const longWord = "word";
    const longPara = Array.from({ length: 250 }, () => longWord).join(" ");
    const p = page("https://example.dev/a", {
      html: `
        <article>
          <h2>A</h2><p>Short paragraph here.</p>
          <h2>B</h2><p>${longPara}</p>
        </article>
      `,
    });
    const findings = contentModularityRule([p], { maxParagraphWords: 200, minSelfContainedRatio: 0.8 });
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/exceed 200 words/);
  });

  test("passes clean, self-contained sections", () => {
    const p = page("https://example.dev/a", {
      html: `
        <article>
          <h2>California LLC Filing Fee</h2>
          <p>California LLC filing costs $70 with the Secretary of State.</p>
          <h2>California LLC Processing Time</h2>
          <p>Standard processing takes 2-4 weeks.</p>
          <h2>California LLC Annual Requirements</h2>
          <p>An $800 annual franchise tax is due each year.</p>
        </article>
      `,
    });
    expect(contentModularityRule([p])).toHaveLength(0);
  });

  test("ignores content inside nav/aside/footer when splitting sections", () => {
    const p = page("https://example.dev/a", {
      html: `
        <article>
          <h2>Main Topic</h2>
          <p>California LLC filing costs $70 with the Secretary of State.</p>
          <aside>
            <h2>Related Posts</h2>
            <p>As mentioned above, these other articles may help.</p>
            <p>See above for our complete LLC guide.</p>
          </aside>
          <h2>More Specifics</h2>
          <p>Processing takes 2-4 weeks standard.</p>
        </article>
      `,
    });
    // Without the nav/aside filter, the <aside>'s "as mentioned above" pattern would
    // flag the article as non-modular. With the filter, the aside is ignored.
    expect(contentModularityRule([p], { minSelfContainedRatio: 0.8 })).toHaveLength(0);
  });

  test("does not flag legitimate section headings like FAQ/Summary/Conclusion", () => {
    const p = page("https://example.dev/a", {
      html: `
        <article>
          <h2>Filing Fees</h2><p>$70 is the fee.</p>
          <h2>FAQ</h2><p>Common questions about the process answered here.</p>
          <h2>Summary</h2><p>California LLC filing takes 2-4 weeks.</p>
          <h2>Conclusion</h2><p>File early to avoid penalty fees.</p>
        </article>
      `,
    });
    // These used to trip VAGUE_HEADING_PATTERNS. After the trim they should not.
    expect(contentModularityRule([p])).toHaveLength(0);
  });

  test("respects minSelfContainedRatio threshold", () => {
    // 1 of 2 sections is vague → 50% self-contained.
    const p = page("https://example.dev/a", {
      html: `
        <article>
          <h2>Specific Topic</h2><p>$70 fee.</p>
          <h2>Details</h2><p>Stuff.</p>
        </article>
      `,
    });
    expect(contentModularityRule([p], { minSelfContainedRatio: 0.4 })).toHaveLength(0);
    expect(contentModularityRule([p], { minSelfContainedRatio: 0.6 })).toHaveLength(1);
  });
});
