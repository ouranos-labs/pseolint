import { describe, it, expect } from "vitest";
import { rewriteMessageForCms, detectCms } from "@/lib/cms-messages";

describe("detectCms", () => {
  it("detects Webflow from /collections/", () => {
    expect(detectCms("https://ex.com/collections/hotels/paris")).toBe("webflow");
  });
  it("detects WordPress from /?p=", () => {
    expect(detectCms("https://ex.com/?p=123")).toBe("wordpress");
  });
  it("detects WordPress from /category/", () => {
    expect(detectCms("https://ex.com/category/news")).toBe("wordpress");
  });
  it("uses HTML hint when URL is ambiguous", () => {
    expect(detectCms("https://ex.com/page/1", "<link href='/wp-content/themes/...'>")).toBe("wordpress");
  });
  it("returns null on no match", () => {
    expect(detectCms("https://ex.com/about")).toBeNull();
  });
  it("returns null on collision with no HTML hint", () => {
    // /collections/ matches Webflow AND could be WooCommerce; no HTML hint → null
    expect(detectCms("https://ex.com/collections/products/?p=1")).toBeNull();
  });
  it("resolves collision to wordpress when HTML has wp-content", () => {
    expect(
      detectCms("https://ex.com/collections/products/?p=1", "<link href='/wp-content/themes/foo'>"),
    ).toBe("wordpress");
  });
});

describe("rewriteMessageForCms", () => {
  it("prefixes Webflow collection context", () => {
    const out = rewriteMessageForCms("thin content detected", "spam/thin-content", "webflow");
    expect(out).toMatch(/Collection/i);
  });
  it("prefixes WordPress context", () => {
    const out = rewriteMessageForCms("thin content detected", "spam/thin-content", "wordpress");
    expect(out).toMatch(/Post Type|WordPress/i);
  });
  it("returns original on null cms", () => {
    expect(rewriteMessageForCms("original", "spam/thin-content", null)).toBe("original");
  });
});
