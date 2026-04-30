import { describe, expect, test } from "vitest";
import { llmsTxtRule, validateLlmsTxt } from "../../../src/rules/aeo/llms-txt.js";

describe("aeo/llms-txt validateLlmsTxt", () => {
  test("accepts a well-formed llms.txt", () => {
    const content = [
      "# pseolint",
      "> The pSEO compliance platform.",
      "",
      "## Docs",
      "- [Getting Started](https://pseolint.dev/docs/start): intro",
    ].join("\n");
    expect(validateLlmsTxt(content).valid).toBe(true);
  });

  test("rejects missing title", () => {
    const r = validateLlmsTxt("no title here\n## Docs\n- [a](https://x.dev): b");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/title/i);
  });

  test("rejects missing sections", () => {
    expect(validateLlmsTxt("# Title\n\n- [a](https://x.dev): b").valid).toBe(false);
  });

  test("rejects missing link entries", () => {
    expect(validateLlmsTxt("# Title\n\n## Docs\n\nSome prose, no links").valid).toBe(false);
  });
});

describe("aeo/llms-txt rule", () => {
  test("warns when llms.txt is missing", async () => {
    const findings = await llmsTxtRule("https://example.dev/", async () => null);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("warning");
    expect(findings[0].message).toMatch(/No llms\.txt/);
    // llms.txt is a draft standard — always low confidence.
    expect(findings[0].confidence).toBe("low");
  });

  test("warns when llms.txt is malformed", async () => {
    const findings = await llmsTxtRule(
      "https://example.dev/",
      async () => "not a valid llms format\n",
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/malformed/);
    expect(findings[0].confidence).toBe("low");
  });

  test("passes when llms.txt is valid", async () => {
    const content = "# Example\n\n## Docs\n- [Home](https://example.dev): home page";
    const findings = await llmsTxtRule("https://example.dev/", async () => content);
    expect(findings).toHaveLength(0);
  });

  test("no-ops for non-HTTP sources (local crawl)", async () => {
    const findings = await llmsTxtRule("/path/to/site", async () => null);
    expect(findings).toHaveLength(0);
  });
});
