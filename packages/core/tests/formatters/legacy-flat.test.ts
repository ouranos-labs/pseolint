/**
 * v0.5.11 — verifies that `legacyFlat: true` suppresses per-template cards
 * in console, markdown, and html formatters, and that the flat per-URL list
 * is still fully rendered.
 */
import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  type AuditSummary,
  type CategoryGrades,
  type IssueBuckets,
  type RuleResult,
  type Template,
  type Verdict,
} from "../../src/types.js";
import { formatConsole } from "../../src/formatters/console.js";
import { formatMarkdown } from "../../src/formatters/markdown.js";
import { formatHtml } from "../../src/formatters/html.js";

// ── helpers ────────────────────────────────────────────────────────────────

function emptyCategories(): CategoryGrades {
  return {
    integrity: { grade: "A", issues: 0 },
    discoverability: { grade: "A", issues: 0 },
    citation: { grade: "A", issues: 0 },
    data: { grade: "A", issues: 0 },
    audit: { grade: "A", issues: 0 },
  };
}

function bucketize(findings: RuleResult[]): IssueBuckets {
  const blockers: RuleResult[] = [];
  const shouldFix: RuleResult[] = [];
  const informational: RuleResult[] = [];
  for (const f of findings) {
    if (f.ruleId.startsWith("audit/")) continue;
    if (f.severity === "critical" || f.severity === "error") blockers.push(f);
    else if (f.severity === "warning") shouldFix.push(f);
    else informational.push(f);
  }
  return { blockers, shouldFix, informational };
}

function makeTemplate(sig: string, verdict: Verdict): Template {
  return {
    signature: sig,
    totalUrls: 500,
    totalDiscoveredUrls: 5000,
    auditedUrls: [`https://example.com${sig.replace(":slug", "test")}`],
    verdict,
    risk: verdict === "critical" ? 80 : 10,
    categories: emptyCategories(),
    variance: {
      ruleFireRates: {},
      uniformityScore: 0.9,
      topDriver: null,
    },
    findingIds: [],
  };
}

function buildSummaryWithTemplates(
  verdict: Verdict = "critical",
  findings: RuleResult[] = [],
): AuditSummary {
  return {
    schemaVersion: SCHEMA_VERSION,
    verdict,
    risk: 75,
    headline: "1 ship-blocker",
    categories: emptyCategories(),
    issues: bucketize(findings),
    diagnostics: {
      originReadiness: null,
      crawlStats: { discovered: 20, fetched: 20, skipped: 0 },
      auditFindings: [],
    },
    pageCount: 20,
    templates: [
      makeTemplate("/listing/:slug", "critical"),
      makeTemplate("/category/:slug", "ready"),
    ],
  } as unknown as AuditSummary;
}

const findings: RuleResult[] = [
  {
    ruleId: "spam/thin-content",
    severity: "error",
    message: "Page has thin content",
    pageUrl: "https://example.com/listing/foo",
    docsUrl: "https://pseolint.dev/rules/thin-content",
  },
];

// ── console formatter ──────────────────────────────────────────────────────

describe("formatConsole — legacyFlat suppresses per-template cards", () => {
  it("renders template cards by default when ≥2 templates", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    const out = formatConsole(summary, { noColor: true });
    expect(out).toContain("Per-template breakdown");
    expect(out).toContain("/listing/:slug");
  });

  it("suppresses template cards when legacyFlat is true", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    const out = formatConsole(summary, { noColor: true, legacyFlat: true });
    expect(out).not.toContain("Per-template breakdown");
  });

  it("still renders findings when legacyFlat is true", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    const out = formatConsole(summary, { noColor: true, legacyFlat: true });
    // Non-verbose mode shows the finding message, not the rule ID
    expect(out).toContain("Page has thin content");
  });

  it("suppresses template cards when perTemplate is false", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    const out = formatConsole(summary, { noColor: true, perTemplate: false });
    expect(out).not.toContain("Per-template breakdown");
  });

  it("legacyFlat wins over perTemplate: true", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    const out = formatConsole(summary, { noColor: true, perTemplate: true, legacyFlat: true });
    expect(out).not.toContain("Per-template breakdown");
  });

  it("does not render cards when templates array has fewer than 2 entries", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    summary.templates = [makeTemplate("/listing/:slug", "critical")];
    const out = formatConsole(summary, { noColor: true });
    expect(out).not.toContain("Per-template breakdown");
  });

  it("does not render cards when templates is undefined (pre-v0.5.9 audit)", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    // Simulate a pre-v0.5.9 audit JSON that has no templates field
    (summary as unknown as Record<string, unknown>).templates = undefined;
    const out = formatConsole(summary, { noColor: true });
    expect(out).not.toContain("Per-template breakdown");
  });
});

// ── markdown formatter ────────────────────────────────────────────────────

describe("formatMarkdown — legacyFlat suppresses per-template cards", () => {
  it("renders template cards by default when ≥2 templates", () => {
    const summary = buildSummaryWithTemplates();
    const out = formatMarkdown(summary);
    expect(out).toContain("## Templates");
  });

  it("suppresses template cards when legacyFlat is true", () => {
    const summary = buildSummaryWithTemplates();
    const out = formatMarkdown(summary, { legacyFlat: true });
    expect(out).not.toContain("## Templates");
  });

  it("suppresses template cards when perTemplate is false", () => {
    const summary = buildSummaryWithTemplates();
    const out = formatMarkdown(summary, { perTemplate: false });
    expect(out).not.toContain("## Templates");
  });

  it("legacyFlat wins over perTemplate: true in markdown", () => {
    const summary = buildSummaryWithTemplates();
    const out = formatMarkdown(summary, { perTemplate: true, legacyFlat: true });
    expect(out).not.toContain("## Templates");
  });
});

// ── html formatter ────────────────────────────────────────────────────────

describe("formatHtml — legacyFlat suppresses per-template cards", () => {
  // The CSS for template-cards is always injected into <style>.
  // We distinguish the presence/absence of the actual <section> element.
  it("renders template-cards section by default when ≥2 templates", () => {
    const summary = buildSummaryWithTemplates();
    const out = formatHtml(summary);
    expect(out).toContain('<section class="template-cards">');
  });

  it("suppresses template-cards section when legacyFlat is true", () => {
    const summary = buildSummaryWithTemplates();
    const out = formatHtml(summary, { legacyFlat: true });
    expect(out).not.toContain('<section class="template-cards">');
  });

  it("suppresses template-cards section when perTemplate is false", () => {
    const summary = buildSummaryWithTemplates();
    const out = formatHtml(summary, { perTemplate: false });
    expect(out).not.toContain('<section class="template-cards">');
  });

  it("still renders bucket sections when legacyFlat is true", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    const out = formatHtml(summary, { legacyFlat: true });
    expect(out).toContain("Blockers");
  });
});

// ── --template filter ──────────────────────────────────────────────────────

describe("--template filter in console formatter", () => {
  it("restricts findings to the matched template's auditedUrls", () => {
    const listingUrl = "https://example.com/listing/test";
    const categoryUrl = "https://example.com/category/test";
    const summary = buildSummaryWithTemplates("critical", [
      {
        ruleId: "spam/thin-content",
        severity: "error",
        message: "Thin listing page",
        pageUrl: listingUrl,
        docsUrl: "https://pseolint.dev/rules/thin-content",
      },
      {
        ruleId: "tech/og-completeness",
        severity: "warning",
        message: "Missing OG on category",
        pageUrl: categoryUrl,
        docsUrl: "https://pseolint.dev/rules/og-completeness",
      },
    ]);
    // Ensure template auditedUrls align with the test URLs
    summary.templates[0].auditedUrls = [listingUrl];
    summary.templates[1].auditedUrls = [categoryUrl];

    const out = formatConsole(summary, {
      noColor: true,
      filterTemplate: "/listing/:slug",
    });
    expect(out).toContain("Thin listing page");
    expect(out).not.toContain("Missing OG on category");
  });

  it("silently ignores filterTemplate when no template matches", () => {
    const summary = buildSummaryWithTemplates("critical", findings);
    // Should not throw, should render normally
    const out = formatConsole(summary, {
      noColor: true,
      filterTemplate: "/nonexistent/:slug",
    });
    // All findings preserved since no match means no filter applied.
    // Non-verbose console shows the message, not the rule ID.
    expect(out).toContain("Page has thin content");
  });
});
