import { describe, expect, test } from "vitest";
import {
  crawlerAccessRule,
  parseRobotsByUserAgent,
  isFullyDisallowed,
  DEFAULT_AI_CRAWLERS,
} from "../../../src/rules/aeo/crawler-access.js";

describe("parseRobotsByUserAgent", () => {
  test("groups Disallow rules by user-agent (case-insensitive)", () => {
    const robots = [
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: *",
      "Disallow: /admin",
    ].join("\n");
    const map = parseRobotsByUserAgent(robots);
    expect(map.get("gptbot")).toEqual(["/"]);
    expect(map.get("*")).toEqual(["/admin"]);
  });

  test("handles stacked user-agent lines sharing one rule block", () => {
    const robots = [
      "User-agent: GPTBot",
      "User-agent: ClaudeBot",
      "Disallow: /",
    ].join("\n");
    const map = parseRobotsByUserAgent(robots);
    expect(map.get("gptbot")).toEqual(["/"]);
    expect(map.get("claudebot")).toEqual(["/"]);
  });

  test("ignores comments and blank lines", () => {
    const robots = "# comment\n\nUser-agent: GPTBot\nDisallow: /secret\n";
    const map = parseRobotsByUserAgent(robots);
    expect(map.get("gptbot")).toEqual(["/secret"]);
  });
});

describe("isFullyDisallowed", () => {
  test("true for root /", () => {
    expect(isFullyDisallowed(["/"])).toBe(true);
  });
  test("false for specific paths", () => {
    expect(isFullyDisallowed(["/admin", "/api"])).toBe(false);
  });
  test("false for undefined", () => {
    expect(isFullyDisallowed(undefined)).toBe(false);
  });
});

describe("aeo/crawler-access rule", () => {
  test("returns no findings when no crawlers are blocked", () => {
    const robots = "User-agent: *\nDisallow: /admin\n";
    expect(crawlerAccessRule(robots)).toHaveLength(0);
  });

  test("warns per blocked crawler", () => {
    const robots = [
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: ClaudeBot",
      "Disallow: /",
    ].join("\n");
    const findings = crawlerAccessRule(robots);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === "warning")).toBe(true);
    const messages = findings.map((f) => f.message).join("\n");
    expect(messages).toMatch(/GPTBot/);
    expect(messages).toMatch(/ClaudeBot/);
  });

  test("errors when ALL configured crawlers are blocked", () => {
    const lines: string[] = [];
    for (const crawler of DEFAULT_AI_CRAWLERS) {
      lines.push(`User-agent: ${crawler}`, "Disallow: /", "");
    }
    const findings = crawlerAccessRule(lines.join("\n"));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
    expect(findings[0].message).toMatch(/all.*AI crawlers/i);
  });

  test("a wildcard Disallow: / blocks crawlers that have no explicit block", () => {
    const robots = "User-agent: *\nDisallow: /\n";
    const findings = crawlerAccessRule(robots);
    // All default crawlers inherit the wildcard block → the "all blocked" error fires.
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  test("explicit permissive block beats wildcard block", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /",
      "",
      "User-agent: GPTBot",
      "Disallow: /admin",
    ].join("\n");
    const findings = crawlerAccessRule(robots, { crawlers: ["GPTBot"] });
    expect(findings).toHaveLength(0);
  });

  test("respects a custom crawler list", () => {
    const robots = "User-agent: MyBot\nDisallow: /\n";
    const findings = crawlerAccessRule(robots, { crawlers: ["MyBot"] });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });

  test("no findings on empty robots.txt", () => {
    expect(crawlerAccessRule("")).toHaveLength(0);
  });

  test("crawler matching is case-insensitive (gptbot == GPTBot == Gptbot)", () => {
    const robots = "User-agent: gptbot\nDisallow: /\n";
    const findings = crawlerAccessRule(robots, { crawlers: ["GPTBot"] });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("error");
  });
});
