import { describe, it, expect } from "vitest";
import {
  AUDIT_FAILURE_CODES,
  classifyAuditFailure,
  describeAuditFailure,
  encodeAuditFailure,
  parseAuditFailure,
} from "@/lib/audit-failure";

describe("classifyAuditFailure", () => {
  const cases: [string, string, string?][] = [
    [
      "Origin looks degraded: aborting audit. p95 tripled. p95=4200ms, baseline=300ms, 5xx=12%, fetches=40.",
      "origin_degraded",
    ],
    ["anything at all", "origin_degraded", "OriginDegradedError"],
    ["robots.txt disallows all paths for user-agent pseolint", "robots_blocked"],
    [
      "Failed to fetch source URL: https://x.com: Failed to fetch source: 404; verify the URL is correct and returns a valid response.",
      "http_4xx",
    ],
    [
      "Failed to fetch source URL: https://x.com: Failed to fetch source: 503; verify the URL is correct and returns a valid response.",
      "http_5xx",
    ],
    ["fetch_sitemap: https://x.com/sitemap.xml returned status 500", "http_5xx"],
    ["Source URL does not look like HTML or sitemap XML: https://x.com/file.pdf", "not_html"],
    ["No pages to audit after filtering", "no_pages"],
    ["The operation was aborted due to timeout", "timeout"],
    ["anything", "timeout", "TimeoutError"],
    ["Failed to fetch source URL: https://x.com: fetch failed; verify the URL is correct", "unreachable"],
    ["getaddrinfo ENOTFOUND x.invalid", "unreachable"],
    ["URL appears to be internal, unreachable, or uses a disallowed scheme.", "unreachable"],
    ["Cannot read properties of undefined (reading 'x')", "unknown"],
    ["", "unknown"],
  ];
  it.each(cases)("%s -> %s", (msg, expected, name) => {
    expect(classifyAuditFailure(msg, name)).toBe(expected);
  });
});

describe("encode / parse", () => {
  it("round-trips code, raw text and refund state", () => {
    const stored = encodeAuditFailure("http_5xx", "Failed to fetch source: 503");
    expect(stored).toBe("[http_5xx] Failed to fetch source: 503");
    expect(parseAuditFailure(stored)).toEqual({ code: "http_5xx", raw: "Failed to fetch source: 503", refunded: true });
  });

  it("marks a non-refunded failure with !", () => {
    const stored = encodeAuditFailure("timeout", "Audit didn't finish within 15 minutes.", { refunded: false });
    expect(stored.startsWith("[timeout!] ")).toBe(true);
    expect(parseAuditFailure(stored)).toMatchObject({ code: "timeout", refunded: false });
  });

  it("caps the stored message at 500 chars", () => {
    expect(encodeAuditFailure("unknown", "x".repeat(1000)).length).toBe(500);
  });

  it("classifies legacy rows (no prefix) on read", () => {
    expect(parseAuditFailure("Failed to fetch source: 404")).toEqual({
      code: "http_4xx",
      raw: "Failed to fetch source: 404",
      refunded: true,
    });
    expect(parseAuditFailure(null)).toEqual({ code: "unknown", raw: "", refunded: true });
  });

  it("ignores a bracket prefix that isn't one of our codes", () => {
    expect(parseAuditFailure("[warn] something").raw).toBe("[warn] something");
  });
});

describe("describeAuditFailure", () => {
  it("every code has one cause and one action, without em dashes", () => {
    for (const code of AUDIT_FAILURE_CODES) {
      const { cause, action } = describeAuditFailure(code, "example.com");
      expect(cause.length).toBeGreaterThan(10);
      expect(action.length).toBeGreaterThan(10);
      expect(cause + action).not.toContain("—");
    }
  });

  it("origin_degraded uses the protect-your-server wording", () => {
    const { cause } = describeAuditFailure("origin_degraded", "example.com");
    expect(cause.startsWith("We stopped early to protect your server")).toBe(true);
    expect(cause).not.toMatch(/paused|charged/i);
  });
});
