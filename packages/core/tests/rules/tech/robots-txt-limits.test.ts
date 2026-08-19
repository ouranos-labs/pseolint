import { describe, expect, test } from "vitest";
import { robotsTxtLimitsRule } from "../../../src/rules/tech/robots-txt-limits.js";

describe("robotsTxtLimitsRule", () => {
  test("returns empty for empty content", () => {
    expect(robotsTxtLimitsRule("")).toHaveLength(0);
  });

  test("clean robots.txt returns no findings", () => {
    const content = [
      "User-agent: *",
      "Disallow: /admin/",
      "Allow: /",
      "",
      "Sitemap: https://example.com/sitemap.xml",
    ].join("\n");
    expect(robotsTxtLimitsRule(content)).toHaveLength(0);
  });

  describe("size limit", () => {
    test("content over 500 KiB fires a high-confidence warning", () => {
      const filler = "Disallow: /some/long/path/segment/\n";
      const content = filler.repeat(Math.ceil((500 * 1024 + 1024) / filler.length));
      const findings = robotsTxtLimitsRule(content);
      const size = findings.filter((f) => f.message.includes("500 KiB"));
      expect(size).toHaveLength(1);
      expect(size[0].severity).toBe("warning");
      expect(size[0].confidence).toBe("high");
      expect(size[0].ruleId).toBe("tech/robots-txt-limits");
      expect(size[0].message).toContain("ignores");
    });

    test("content just under 500 KiB does not fire the size warning", () => {
      const content = "#".repeat(500 * 1024);
      const findings = robotsTxtLimitsRule(content);
      expect(findings.every((f) => !f.message.includes("500 KiB"))).toBe(true);
    });

    test("size is measured in utf8 bytes, not characters", () => {
      // 3-byte UTF-8 characters: 200,000 chars = 600,000 bytes > 500 KiB
      const content = "€".repeat(200_000);
      const findings = robotsTxtLimitsRule(content);
      expect(findings.some((f) => f.message.includes("500 KiB"))).toBe(true);
    });
  });

  describe("unsupported directives", () => {
    test("noindex directive escalates the rollup finding to warning and names noindex", () => {
      const content = [
        "User-agent: *",
        "Disallow: /private/",
        "Noindex: /private/",
      ].join("\n");
      const findings = robotsTxtLimitsRule(content);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].message).toContain("noindex");
      expect(findings[0].message).toContain("falsely believe");
      expect(findings[0].ruleId).toBe("tech/robots-txt-limits");
    });

    test("crawl-delay produces an info finding", () => {
      const content = [
        "User-agent: *",
        "Crawl-delay: 10",
        "Disallow: /tmp/",
      ].join("\n");
      const findings = robotsTxtLimitsRule(content);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("info");
      expect(findings[0].message).toContain("crawl-delay");
      expect(findings[0].message).toContain("Bing");
    });

    test("nofollow and host are listed in one rollup finding", () => {
      const content = [
        "User-agent: *",
        "Nofollow: /a",
        "Host: example.com",
      ].join("\n");
      const findings = robotsTxtLimitsRule(content);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("info");
      expect(findings[0].message).toContain("nofollow");
      expect(findings[0].message).toContain("host");
    });

    test("matching is case-insensitive and tolerates leading whitespace", () => {
      const content = "   NOINDEX : /x";
      const findings = robotsTxtLimitsRule(content);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("warning");
    });

    test("the word noindex inside a comment does NOT fire", () => {
      const content = [
        "User-agent: *",
        "# noindex: this used to work, removed 2019",
        "Disallow: /old/",
      ].join("\n");
      expect(robotsTxtLimitsRule(content)).toHaveLength(0);
    });

    test("noindex appearing mid-line (not line-leading) does NOT fire", () => {
      const content = "Disallow: /noindex:page";
      expect(robotsTxtLimitsRule(content)).toHaveLength(0);
    });

    test("noindex alongside crawl-delay produces a single warning rollup naming both", () => {
      const content = [
        "User-agent: *",
        "noindex: /a",
        "crawl-delay: 5",
      ].join("\n");
      const findings = robotsTxtLimitsRule(content);
      expect(findings).toHaveLength(1);
      expect(findings[0].severity).toBe("warning");
      expect(findings[0].message).toContain("noindex");
      expect(findings[0].message).toContain("crawl-delay");
    });
  });
});
