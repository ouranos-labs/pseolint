/**
 * The backtick → <code> mechanism.
 *
 * This is not only typography. Two rule pages were flagged by their own rules
 * (`content/common-phrase-reuse` on /rules/common-phrase-reuse,
 * `content/regurgitated-content` on /rules/regurgitated-content) because they
 * quote the patterns they document as plain prose. The engine already strips
 * EXAMPLE_REGION_SELECTOR: "pre, code, blockquote, figure, samp, kbd,
 * [data-example]": before scanning, so emitting <code> for a specimen is the
 * designed way to say "quoting, not committing" without carving our own domain
 * out of our own engine.
 *
 * If renderInline stops producing <code>, those false positives return, so the
 * <code> element name is the assertion that matters here.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderInline, plainText } from "@/components/marketing/inline-markup";

const html = (text: string) => renderToStaticMarkup(<>{renderInline(text)}</>);

describe("renderInline", () => {
  it("wraps a backticked span in <code>", () => {
    const out = html("a page leaning on `hidden gem` reads as templated");
    expect(out).toContain("<code");
    expect(out).toContain("hidden gem</code>");
    // The surrounding prose stays prose.
    expect(out).toContain("a page leaning on ");
  });

  it("emits no backticks in the output", () => {
    expect(html("the `thinMinWords` threshold")).not.toContain("`");
  });

  it("wraps every specimen when several appear", () => {
    const out = html("`hidden gem`, `trusted by thousands` and `discover the best`");
    expect(out.match(/<code/g) ?? []).toHaveLength(3);
  });

  it("leaves text without backticks untouched", () => {
    const out = html("no specimens here at all");
    expect(out).not.toContain("<code");
    expect(out).toContain("no specimens here at all");
  });

  it("does not treat an unpaired backtick as markup", () => {
    const out = html("an unpaired ` backtick");
    expect(out).not.toContain("<code");
  });

  it("keeps prose usage outside code, so it still counts against the page", () => {
    // Only the quoted specimen is exempted; the bare cliché stays in prose.
    const out = html("uses `world-class` but also says hidden gem plainly");
    expect(out).toContain("world-class</code>");
    const afterCode = out.slice(out.indexOf("</code>"));
    expect(afterCode).toContain("hidden gem");
    expect(afterCode).not.toContain("<code");
  });
});

describe("plainText", () => {
  it("strips backticks for JSON-LD and meta descriptions", () => {
    expect(plainText("the `thinMinWords` threshold")).toBe("the thinMinWords threshold");
  });

  it("is a no-op on text without backticks", () => {
    expect(plainText("nothing to strip")).toBe("nothing to strip");
  });
});
