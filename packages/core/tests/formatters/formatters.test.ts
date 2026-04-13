import { describe, expect, it } from "vitest";
import type { AuditSummary } from "../../src/types.js";
import { formatConsole } from "../../src/formatters/console.js";
import { formatJson } from "../../src/formatters/json.js";
import { formatMarkdown } from "../../src/formatters/markdown.js";
import { formatHtml } from "../../src/formatters/html.js";

const mockSummary: AuditSummary = {
  score: 42,
  categoryScores: {
    spam: 55,
    content: 30,
    links: 20,
    tech: 10,
    schema: 45,
    cannibal: 60,
  },
  pageCount: 150,
  findings: [
    {
      ruleId: "spam/thin-content",
      severity: "error",
      message: "Page has thin content (50 words).",
      pageUrl: "https://example.com/page-1",
    },
    {
      ruleId: "links/orphan-pages",
      severity: "warning",
      message: "Page is an orphan with no inbound links.",
      pageUrl: "https://example.com/page-2",
    },
    {
      ruleId: "tech/canonical-consistency",
      severity: "critical",
      message: "Canonical mismatch detected.",
      pageUrl: "https://example.com/page-3",
    },
    {
      ruleId: "content/heading-uniqueness",
      severity: "info",
      message: "Heading is duplicated across 3 pages.",
    },
  ],
};

describe("formatConsole", () => {
  it("returns a non-empty string containing the score", () => {
    const output = formatConsole(mockSummary);
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("42");
  });
});

describe("formatJson", () => {
  it("returns a non-empty string containing the score", () => {
    const output = formatJson(mockSummary);
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("42");
  });

  it("is valid JSON that round-trips the summary", () => {
    const parsed = JSON.parse(formatJson(mockSummary));
    expect(parsed.score).toBe(42);
    expect(parsed.pageCount).toBe(150);
  });
});

describe("formatMarkdown", () => {
  it("returns a non-empty string containing the score", () => {
    const output = formatMarkdown(mockSummary);
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("42");
  });
});

describe("formatHtml", () => {
  it("returns a non-empty string containing the score", () => {
    const output = formatHtml(mockSummary);
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("42");
  });

  it("is a self-contained HTML document", () => {
    const output = formatHtml(mockSummary);
    expect(output).toContain("<!DOCTYPE html>");
    expect(output).toContain("<style>");
    expect(output).toContain("</html>");
  });
});
