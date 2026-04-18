import { describe, expect, it } from "vitest";
import type { AuditSummary, FindingContext } from "../../src/types.js";
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

const enrichedSummary: AuditSummary = {
  score: 84,
  categoryScores: { spam: 100, content: 100, links: 29, tech: 100, schema: 0, cannibal: 100 },
  pageCount: 476,
  templateDetected: true,
  rawFindingCount: 4673,
  findings: [
    {
      ruleId: "spam/near-duplicate",
      severity: "critical",
      message: "47 pages form a near-duplicate cluster (85.9\u201390.6% similar).",
      pageUrl: "https://example.com/page-1",
      context: {
        type: "cluster",
        clusterSize: 47,
        members: ["https://example.com/page-1", "https://example.com/page-2"],
        worstPairs: [{ left: "https://example.com/page-1", right: "https://example.com/page-2", similarity: 0.906 }],
        similarityRange: [0.859, 0.906] as [number, number],
      },
      effort: "structural",
      fix: "Your template produces 47 near-identical pages.",
    },
    {
      ruleId: "tech/og-completeness",
      severity: "warning",
      message: "Missing og:image.",
      pageUrl: "https://example.com/page-3",
      effort: "quick",
      fix: "Add og:image to your page template.",
    },
  ],
};

describe("formatConsole — enriched output", () => {
  it("shows template banner when templateDetected is true", () => {
    const output = formatConsole(enrichedSummary);
    expect(output).toContain("Template-generated content detected");
  });

  it("renders effort labels", () => {
    const output = formatConsole(enrichedSummary, { noColor: true });
    expect(output).toContain("[structural]");
    expect(output).toContain("[quick fix]");
  });

  it("renders cluster worst pair", () => {
    const output = formatConsole(enrichedSummary, { noColor: true });
    expect(output).toContain("/page-1");
    expect(output).toContain("90.6%");
  });
});

describe("formatHtml — enriched output", () => {
  it("renders collapsible details element for clusters", () => {
    const output = formatHtml(enrichedSummary);
    expect(output).toContain("<details>");
    expect(output).toContain("<summary>");
  });

  it("renders effort pills", () => {
    const output = formatHtml(enrichedSummary);
    expect(output).toContain("effort-pill");
    expect(output).toContain("structural");
    expect(output).toContain("quick");
  });

  it("renders template banner", () => {
    const output = formatHtml(enrichedSummary);
    expect(output).toContain("template-banner");
    expect(output).toContain("Template-generated content detected");
  });
});

describe("formatMarkdown — enriched output", () => {
  it("includes effort badge inline", () => {
    const output = formatMarkdown(enrichedSummary);
    expect(output).toContain("(**structural fix**)");
    expect(output).toContain("(**quick fix**)");
  });

  it("renders template banner as blockquote", () => {
    const output = formatMarkdown(enrichedSummary);
    expect(output).toContain("> Template-generated content detected");
  });
});

describe("formatJson — enriched output", () => {
  it("preserves context and effort in JSON output", () => {
    const parsed = JSON.parse(formatJson(enrichedSummary));
    expect(parsed.templateDetected).toBe(true);
    expect(parsed.rawFindingCount).toBe(4673);
    expect(parsed.findings[0].context.type).toBe("cluster");
    expect(parsed.findings[0].effort).toBe("structural");
    expect(parsed.findings[1].effort).toBe("quick");
  });
});

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

  it("renders AI triage section in HTML output", () => {
    const summary: AuditSummary = {
      score: 80,
      categoryScores: { spam: 80, content: 80, links: 80, tech: 80, schema: 80, cannibal: 80 },
      pageCount: 10,
      findings: [],
      triage: {
        rootCauses: [
          { label: "Templating", findingsCount: 100, affectedRuleIds: ["spam/x"], severity: "warning", fixOrder: 1, rationale: "Fix it.", relatedFindingIds: [] },
        ],
        narrative: "Issues found.",
        modelUsed: "claude-sonnet-4-6",
        providerId: "anthropic",
        tokenUsage: { input: 1000, output: 200 },
        cacheHit: false,
        promptVersion: "1.0.0",
        truncatedInput: false,
      },
    };
    const out = formatHtml(summary);
    expect(out).toContain('<section class="ai-triage">');
    expect(out).toContain("Templating");
    expect(out).toContain("Issues found.");
  });

  it("escapes HTML in triage label and rationale", () => {
    const summary: AuditSummary = {
      score: 80,
      categoryScores: { spam: 80, content: 80, links: 80, tech: 80, schema: 80, cannibal: 80 },
      pageCount: 10,
      findings: [],
      triage: {
        rootCauses: [
          { label: "<script>alert(1)</script>", findingsCount: 1, affectedRuleIds: ["x"], severity: "warning", fixOrder: 1, rationale: "<b>x</b>", relatedFindingIds: [] },
        ],
        narrative: "n",
        modelUsed: "m",
        providerId: "anthropic",
        tokenUsage: { input: 0, output: 0 },
        cacheHit: false,
        promptVersion: "1.0.0",
        truncatedInput: false,
      },
    };
    const out = formatHtml(summary);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
