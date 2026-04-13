import { describe, expect, test } from "vitest";
import { mergeNormalizeUrlOptions, normalizeAuditUrl } from "../src/url-normalize.js";

describe("normalizeAuditUrl", () => {
  test("lowercases host and strips hash", () => {
    expect(normalizeAuditUrl("HTTPS://Example.COM/foo#frag")).toBe("https://example.com/foo");
  });

  test("strips query string by default", () => {
    expect(normalizeAuditUrl("https://example.com/foo?x=1&y=2")).toBe("https://example.com/foo");
  });

  test("preserves query when stripQuery is false", () => {
    expect(normalizeAuditUrl("https://example.com/foo?x=1", { stripQuery: false })).toBe(
      "https://example.com/foo?x=1"
    );
  });

  test("optionally strips leading www", () => {
    expect(normalizeAuditUrl("https://www.example.com/foo", { stripWwwHost: true })).toBe(
      "https://example.com/foo"
    );
  });

  test("drops default ports and trims trailing slash on paths", () => {
    expect(normalizeAuditUrl("http://example.com:80/foo/")).toBe("http://example.com/foo");
    expect(normalizeAuditUrl("https://example.com:443/bar/")).toBe("https://example.com/bar");
  });

  test("normalizes filesystem paths", () => {
    expect(normalizeAuditUrl("D:\\a\\b\\..\\c")).toBe("D:\\a\\c");
  });
});

describe("mergeNormalizeUrlOptions", () => {
  test("defaults stripQuery true and stripWwwHost false", () => {
    const m = mergeNormalizeUrlOptions();
    expect(m.stripQuery).toBe(true);
    expect(m.stripWwwHost).toBe(false);
  });
});
