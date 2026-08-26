import { describe, it, expect } from "vitest";
import { decodeHtml } from "./og-fetch";

/**
 * Regression cover for the two bugs that put raw `&#x27;` on the leaderboard:
 * hex entities were never decoded, and the chained-replace ordering
 * double-decoded anything escaped as `&amp;<entity>;`.
 */
describe("decodeHtml", () => {
  it("decodes hex entities (the leaderboard's raw &#x27; bug)", () => {
    expect(decodeHtml("L&#x27;argent que tu envoies")).toBe("L'argent que tu envoies");
    expect(decodeHtml("caf&#xE9;")).toBe("café");
  });

  it("decodes decimal entities", () => {
    expect(decodeHtml("L&#39;argent")).toBe("L'argent");
  });

  it("decodes named entities, case-insensitively", () => {
    expect(decodeHtml("a &lt;b&gt; &quot;c&quot; &apos;d&apos; e&nbsp;f &amp; g")).toBe(
      "a <b> \"c\" 'd' e f & g",
    );
    expect(decodeHtml("&AMP;")).toBe("&");
  });

  it("does not double-decode: &amp;lt; stays literal &lt;", () => {
    // The chained-.replace() version resolved &amp; first and then re-decoded
    // its own output, turning displayable markup into real markup.
    expect(decodeHtml("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  it("leaves unknown and malformed entities untouched", () => {
    expect(decodeHtml("100 &blah; &#; &#xZZ; 50&")).toBe("100 &blah; &#; &#xZZ; 50&");
  });

  it("rejects out-of-range code points rather than throwing", () => {
    expect(decodeHtml("&#x110000;")).toBe("&#x110000;");
    expect(decodeHtml("&#0;")).toBe("&#0;");
  });
});
