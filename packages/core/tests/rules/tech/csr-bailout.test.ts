import { describe, it, expect } from "vitest";
import { csrBailoutRule } from "../../../src/rules/tech/csr-bailout.js";
import type { ParsedPage } from "../../../src/types.js";

function page(p: Partial<ParsedPage> & { url: string; html: string }): ParsedPage {
  return { contentText: "", title: "", url: p.url, html: p.html, ...p } as ParsedPage;
}

const FORM = "<form><input name=a><input name=b><input name=c><textarea></textarea><button>Generate</button></form>";

describe("csr-bailout", () => {
  it("flags partial shell: 0 raw interactive, many rendered (high)", () => {
    const out = csrBailoutRule([page({
      url: "https://x.com/t/1",
      html: '<div id="__next"></div><script>self.__next_f.push([1])</script>',
      renderedHtml: `<div id="__next">${FORM}</div>`,
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBe("tech/csr-bailout");
    expect(out[0].confidence).toBe("high");
    expect(out[0].message).toMatch(/next build && next start/i);
  });

  it("does not flag healthy page: raw ~ rendered", () => {
    const html = `<div id="__next">${FORM}</div>`;
    expect(csrBailoutRule([page({ url: "https://x.com/t/2", html, renderedHtml: html })])).toHaveLength(0);
  });

  it("flags content bail: tiny raw words, large rendered words (medium)", () => {
    const big = "<p>" + "word ".repeat(400) + "</p>";
    const out = csrBailoutRule([page({
      url: "https://x.com/a",
      html: "<div id=root></div><script src=/b.js></script><p>hi there friend</p>",
      renderedHtml: `<div id=root>${big}</div>`,
    })]);
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe("medium");
  });

  it("no-ops when renderedHtml is absent (render off)", () => {
    expect(csrBailoutRule([page({ url: "https://x.com/t/3", html: "<div id=__next></div>" })])).toHaveLength(0);
  });

  it("does not flag a tiny client widget below MIN_INTERACTIVE", () => {
    expect(csrBailoutRule([page({
      url: "https://x.com/m",
      html: "<div id=root></div><script src=/b.js></script>",
      renderedHtml: "<div id=root><button>Subscribe</button></div>",
    })])).toHaveLength(0);
  });
});
