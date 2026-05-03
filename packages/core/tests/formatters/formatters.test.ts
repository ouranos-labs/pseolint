import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  type AuditSummary,
  type CategoryGrades,
  type IssueBuckets,
  type RuleResult,
  type Verdict,
} from "../../src/types.js";
import { formatConsole, aeoScoreLabel } from "../../src/formatters/console.js";
import { formatJson } from "../../src/formatters/json.js";
import { formatMarkdown } from "../../src/formatters/markdown.js";
import { formatHtml } from "../../src/formatters/html.js";
import { bucketByTemplate } from "../../src/formatters/bucket-findings.js";
import { formatFixplan } from "../../src/formatters/fixplan.js";

// ── helpers to build valid v0.4 summaries ──────────────────────────────
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

function buildSummary(opts: {
  verdict?: Verdict;
  risk?: number;
  headline?: string;
  categories?: CategoryGrades;
  findings?: RuleResult[];
  pageCount?: number;
  templateDetected?: boolean;
  rawFindingCount?: number;
  triage?: AuditSummary["triage"];
}): AuditSummary {
  const findings = opts.findings ?? [];
  const issues = bucketize(findings);
  // Populate docsUrl on every finding (mirrors what the auditor does).
  for (const f of findings) {
    if (!f.docsUrl) {
      f.docsUrl = `https://pseolint.dev/rules/${f.ruleId.split("/").pop() ?? f.ruleId}`;
    }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    verdict: opts.verdict ?? "caution",
    risk: opts.risk ?? 42,
    headline:
      opts.headline ??
      `${issues.blockers.length} ship-blockers, ${issues.shouldFix.length} should-fix`,
    categories: opts.categories ?? emptyCategories(),
    issues,
    diagnostics: {
      originReadiness: null,
      crawlStats: {
        discovered: opts.pageCount ?? 0,
        fetched: opts.pageCount ?? 0,
        skipped: 0,
      },
    },
    // Legacy compat shim — the formatters MUST NOT consume these.
    score: opts.risk ?? 42,
    categoryScores: {
      spam: 0,
      content: 0,
      aeo: 0,
      links: 0,
      tech: 0,
      data: 0,
      schema: 0,
      cannibal: 0,
    },
    findings,
    pageCount: opts.pageCount ?? findings.length,
    templateDetected: opts.templateDetected,
    rawFindingCount: opts.rawFindingCount,
    triage: opts.triage,
  };
}

// ── fixture summaries ──────────────────────────────────────────────────
const mockSummary = buildSummary({
  verdict: "caution",
  risk: 42,
  pageCount: 150,
  categories: {
    integrity: { grade: "B", issues: 1 },
    discoverability: { grade: "C", issues: 2 },
    citation: { grade: "A", issues: 0 },
    data: { grade: "A", issues: 0 },
    audit: { grade: "A", issues: 0 },
  },
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
});

const enrichedSummary = buildSummary({
  verdict: "critical",
  risk: 84,
  pageCount: 476,
  templateDetected: true,
  rawFindingCount: 4673,
  categories: {
    integrity: { grade: "F", issues: 1 },
    discoverability: { grade: "C", issues: 1 },
    citation: { grade: "A", issues: 0 },
    data: { grade: "A", issues: 0 },
    audit: { grade: "A", issues: 0 },
  },
  findings: [
    {
      ruleId: "spam/near-duplicate",
      severity: "critical",
      message: "47 pages form a near-duplicate cluster (85.9–90.6% similar).",
      pageUrl: "https://example.com/page-1",
      context: {
        type: "cluster",
        clusterSize: 47,
        members: ["https://example.com/page-1", "https://example.com/page-2"],
        worstPairs: [
          {
            left: "https://example.com/page-1",
            right: "https://example.com/page-2",
            similarity: 0.906,
          },
        ],
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
});

// ── console formatter ──────────────────────────────────────────────────
describe("formatConsole — v0.4 output", () => {
  it("renders verdict line and category grade strip", () => {
    const out = formatConsole(mockSummary, { noColor: true });
    expect(out).toContain("Verdict: CAUTION");
    expect(out).toContain("Integrity B");
    expect(out).toContain("Discoverability C");
    expect(out).toContain("Citation A");
    expect(out).toContain("Data A");
  });

  it("renders headline and top-fix list with docs URL", () => {
    const out = formatConsole(mockSummary, { noColor: true });
    expect(out).toContain("top fixes by impact");
    expect(out).toContain("pseolint.dev/rules/");
  });

  it("shows template banner when templateDetected is true", () => {
    const out = formatConsole(enrichedSummary, { noColor: true });
    expect(out).toContain("Template-generated content detected");
  });

  it("verbose mode dumps every bucket", () => {
    const out = formatConsole(mockSummary, { noColor: true, verbose: true });
    expect(out).toContain("BLOCKERS");
    expect(out).toContain("SHOULD-FIX");
    expect(out).toContain("INFORMATIONAL");
    expect(out).toContain("spam/thin-content");
    expect(out).toContain("links/orphan-pages");
    expect(out).toContain("content/heading-uniqueness");
  });

  it("non-verbose mode includes the --explain hint when issues exist", () => {
    const out = formatConsole(mockSummary, { noColor: true });
    expect(out).toContain("pseolint --explain");
  });

  it("shows crawl-stats line", () => {
    const out = formatConsole(mockSummary, { noColor: true });
    expect(out).toMatch(/Discovered \d+ content pages?/);
  });

  it("renders nothing for triage when absent", () => {
    const out = formatConsole(mockSummary, { noColor: true });
    expect(out).not.toContain("AI Triage");
  });

  it("renders triage section when provided, sorted by fixOrder", () => {
    const summary = buildSummary({
      verdict: "concerning",
      triage: {
        rootCauses: [
          {
            label: "Second",
            findingsCount: 5,
            affectedRuleIds: ["x/y"],
            severity: "warning",
            fixOrder: 2,
            rationale: "Do this second.",
            relatedFindingIds: [],
          },
          {
            label: "First",
            findingsCount: 10,
            affectedRuleIds: ["a/b"],
            severity: "error",
            fixOrder: 1,
            rationale: "Do this first.",
            relatedFindingIds: [],
          },
        ],
        narrative: "Fix the template.",
        modelUsed: "claude-sonnet-4-6",
        providerId: "anthropic",
        tokenUsage: { input: 47000, output: 1200 },
        estimatedCostUsd: 0.14,
        cacheHit: false,
        promptVersion: "1.0.0",
        truncatedInput: false,
      },
    });
    const out = formatConsole(summary, { noColor: true });
    expect(out).toContain("AI Triage");
    expect(out).toContain("claude-sonnet-4-6");
    expect(out.indexOf("1. First")).toBeLessThan(out.indexOf("2. Second"));
    expect(out).toContain("47,000 input");
    expect(out).toContain("est $0.14");
  });
});

// ── markdown formatter ─────────────────────────────────────────────────
describe("formatMarkdown — v0.4 output", () => {
  it("renders Verdict and Risk header", () => {
    const out = formatMarkdown(mockSummary);
    expect(out).toContain("# pseolint report");
    expect(out).toContain("**Verdict:**");
    expect(out).toContain("Caution");
    expect(out).toContain("**Risk:** 42 / 100");
  });

  it("renders the Categories table with grades", () => {
    const out = formatMarkdown(mockSummary);
    expect(out).toContain("## Categories");
    expect(out).toContain("| Integrity | B | 1 |");
    expect(out).toContain("| Citation | A | 0 |");
  });

  it("renders three issue buckets with docs links", () => {
    // 2026-05-03 calibration credibility fix: informational findings now
    // collapse behind a <details> block by default. Webflow's templates
    // gallery had 118 info findings — rendered as 118 markdown bullets,
    // they drowned the actionable signal. The summary line preserves the
    // count for visibility.
    const out = formatMarkdown(mockSummary);
    expect(out).toContain("## Blockers (2)");
    expect(out).toContain("## Should fix (1)");
    expect(out).toContain("Informational (1)");
    expect(out).toContain("<details>");
    expect(out).toContain("[docs](https://pseolint.dev/rules/thin-content)");
  });

  it("renders template banner as blockquote", () => {
    const out = formatMarkdown(enrichedSummary);
    expect(out).toContain("> Template-generated content detected");
  });

  it("renders AI triage as markdown table + bullets", () => {
    const summary = buildSummary({
      triage: {
        rootCauses: [
          {
            label: "Templating",
            findingsCount: 100,
            affectedRuleIds: ["spam/x"],
            severity: "warning",
            fixOrder: 1,
            rationale: "Fix template.",
            relatedFindingIds: [],
          },
        ],
        narrative: "Site has templating issues.",
        modelUsed: "claude-sonnet-4-6",
        providerId: "anthropic",
        tokenUsage: { input: 1000, output: 200 },
        cacheHit: true,
        promptVersion: "1.0.0",
        truncatedInput: false,
      },
    });
    const out = formatMarkdown(summary);
    expect(out).toContain("## AI Triage");
    expect(out).toContain("| 1 | Templating |");
    expect(out).toContain("Site has templating issues.");
    expect(out).toContain("claude-sonnet-4-6");
  });
});

// ── json formatter ────────────────────────────────────────────────────
describe("formatJson — v0.4 output", () => {
  it("preserves the full v0.4 shape verbatim", () => {
    const parsed = JSON.parse(formatJson(enrichedSummary));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.verdict).toBe("critical");
    expect(parsed.risk).toBe(84);
    expect(parsed.headline).toBeTruthy();
    expect(parsed.categories.integrity.grade).toBe("F");
    expect(parsed.issues.blockers.length).toBe(1);
    expect(parsed.issues.shouldFix.length).toBe(1);
    expect(parsed.diagnostics.crawlStats.discovered).toBe(476);
    expect(parsed.templateDetected).toBe(true);
    expect(parsed.rawFindingCount).toBe(4673);
    expect(parsed.issues.blockers[0].context.type).toBe("cluster");
    expect(parsed.issues.blockers[0].effort).toBe("structural");
    expect(parsed.issues.blockers[0].docsUrl).toContain("pseolint.dev/rules/");
  });

  it("accepts options object without altering output", () => {
    const a = formatJson(mockSummary);
    const b = formatJson(mockSummary, { verbose: true, noColor: true });
    expect(a).toBe(b);
  });
});

// ── html formatter ────────────────────────────────────────────────────
describe("formatHtml — v0.4 output", () => {
  it("renders the verdict badge and four category tiles", () => {
    const out = formatHtml(mockSummary);
    expect(out).toContain("verdict-badge");
    expect(out).toContain("Caution");
    expect(out).toContain("cat-grade");
    expect(out).toContain(">Integrity<");
    expect(out).toContain(">Discoverability<");
    expect(out).toContain(">Citation<");
    expect(out).toContain(">Data<");
  });

  it("renders three bucket sections with finding rows", () => {
    const out = formatHtml(mockSummary);
    expect(out).toContain("Blockers");
    expect(out).toContain("Should fix");
    expect(out).toContain("Informational");
    expect(out).toContain("docs-link");
    expect(out).toContain("pseolint.dev/rules/thin-content");
  });

  it("is a self-contained HTML document", () => {
    const out = formatHtml(mockSummary);
    expect(out).toContain("<!DOCTYPE html>");
    expect(out).toContain("<style>");
    expect(out).toContain("</html>");
  });

  it("renders cluster details on cluster findings", () => {
    const out = formatHtml(enrichedSummary);
    expect(out).toContain("<details");
    expect(out).toContain("pages in cluster");
  });

  it("renders effort pills", () => {
    const out = formatHtml(enrichedSummary);
    expect(out).toContain("effort-pill");
    expect(out).toContain("structural");
    expect(out).toContain("quick");
  });

  it("renders template banner when templateDetected is true", () => {
    const out = formatHtml(enrichedSummary);
    expect(out).toContain("template-banner");
    expect(out).toContain("Template-generated content detected");
  });

  it("renders origin readiness card when diagnostics provide one", () => {
    const summary = buildSummary({});
    summary.diagnostics.originReadiness = {
      liveFetchCount: 12,
      medianMs: 145,
      p95Ms: 820,
      successRatio: 1,
      serverErrorCount: 0,
      serverErrorRatio: 0,
      cacheAssistRatio: 0.5,
      verdict: "concerning",
    };
    const out = formatHtml(summary);
    expect(out).toContain("Origin readiness");
    expect(out).toContain("145 ms");
    expect(out).toContain("820 ms");
  });

  it("renders AI triage section in HTML output", () => {
    const summary = buildSummary({
      triage: {
        rootCauses: [
          {
            label: "Templating",
            findingsCount: 100,
            affectedRuleIds: ["spam/x"],
            severity: "warning",
            fixOrder: 1,
            rationale: "Fix it.",
            relatedFindingIds: [],
          },
        ],
        narrative: "Issues found.",
        modelUsed: "claude-sonnet-4-6",
        providerId: "anthropic",
        tokenUsage: { input: 1000, output: 200 },
        cacheHit: false,
        promptVersion: "1.0.0",
        truncatedInput: false,
      },
    });
    const out = formatHtml(summary);
    expect(out).toContain('<section class="ai-triage">');
    expect(out).toContain("Templating");
    expect(out).toContain("Issues found.");
  });

  it("escapes HTML in triage label and rationale", () => {
    const summary = buildSummary({
      triage: {
        rootCauses: [
          {
            label: "<script>alert(1)</script>",
            findingsCount: 1,
            affectedRuleIds: ["x"],
            severity: "warning",
            fixOrder: 1,
            rationale: "<b>x</b>",
            relatedFindingIds: [],
          },
        ],
        narrative: "n",
        modelUsed: "m",
        providerId: "anthropic",
        tokenUsage: { input: 0, output: 0 },
        cacheHit: false,
        promptVersion: "1.0.0",
        truncatedInput: false,
      },
    });
    const out = formatHtml(summary);
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });
});

describe("aeoScoreLabel", () => {
  it("maps score bands to AEO-specific labels", () => {
    expect(aeoScoreLabel(0)).toBe("AI-Ready");
    expect(aeoScoreLabel(20)).toBe("AI-Ready");
    expect(aeoScoreLabel(21)).toBe("Partial");
    expect(aeoScoreLabel(40)).toBe("Partial");
    expect(aeoScoreLabel(41)).toBe("Vulnerable");
    expect(aeoScoreLabel(60)).toBe("Vulnerable");
    expect(aeoScoreLabel(61)).toBe("Invisible");
    expect(aeoScoreLabel(80)).toBe("Invisible");
    expect(aeoScoreLabel(81)).toBe("Ghost");
    expect(aeoScoreLabel(100)).toBe("Ghost");
  });
});

// ── fixplan formatter ──────────────────────────────────────────────────
describe("formatFixplan — markdown checklist output", () => {
  it("emits the 'no findings' line when there's nothing to fix", () => {
    const summary = buildSummary({ verdict: "ready", risk: 5, findings: [] });
    const out = formatFixplan(summary, { generatedDate: "2026-04-30" });
    expect(out).toContain("# pseolint fix plan");
    expect(out).toContain("Verdict: **ready**");
    expect(out).toContain("No findings to fix");
    expect(out).not.toContain("## Quick wins");
  });

  it("groups findings into quick / moderate / structural sections in order", () => {
    const summary = buildSummary({
      verdict: "caution",
      risk: 25,
      pageCount: 23,
      findings: [
        {
          ruleId: "aeo/citable-facts",
          severity: "warning",
          message: "Only 2 citable facts found.",
          fix: "Add 3+ more entity-specific facts ($X, %, dates, named refs).",
          pageUrl: "https://example.com/leaderboard",
          effort: "quick",
        },
        {
          ruleId: "aeo/summary-bait",
          severity: "warning",
          message: "71% of citable facts (5/7) currently sit in the first 150 words",
          fix: "Restructure to push citable facts below the fold. Add interactive comparison element above.",
          pageUrl: "https://example.com/tools",
          effort: "moderate",
        },
        {
          ruleId: "content/unique-value",
          severity: "error",
          message: "Page has fewer than 100 words of unique-to-page text.",
          fix: "Each affected page has fewer than 100 words of unique-to-page text. Add page-specific paragraphs.",
          pageUrl: "https://example.com/a",
          effort: "structural",
        },
        {
          ruleId: "content/unique-value",
          severity: "error",
          message: "Page has fewer than 100 words of unique-to-page text.",
          fix: "Each affected page has fewer than 100 words of unique-to-page text. Add page-specific paragraphs.",
          pageUrl: "https://example.com/b",
          effort: "structural",
        },
      ],
    });
    const out = formatFixplan(summary, { generatedDate: "2026-04-30" });
    const quickIdx = out.indexOf("## Quick wins");
    const moderateIdx = out.indexOf("## Moderate fixes");
    const structuralIdx = out.indexOf("## Structural changes");
    expect(quickIdx).toBeGreaterThan(-1);
    expect(moderateIdx).toBeGreaterThan(quickIdx);
    expect(structuralIdx).toBeGreaterThan(moderateIdx);
    // Check checkbox markdown is present.
    expect(out).toContain("- [ ] **`aeo/citable-facts`");
    expect(out).toContain("- [ ] **`aeo/summary-bait`");
    expect(out).toContain("- [ ] **`content/unique-value`");
    // Footer estimate.
    expect(out).toContain("fix-plan items");
    expect(out).toContain("Estimated time-to-`ready`");
  });

  it("collapses template-pattern findings into a single bucket with × N", () => {
    const summary = buildSummary({
      verdict: "concerning",
      risk: 55,
      pageCount: 4,
      findings: [
        {
          ruleId: "aeo/answer-first",
          severity: "warning",
          message: "Opener has no specific numbers, dates, or dollar amounts.",
          fix: "Restructure each page opener to lead with a number + named entity (<100 words).",
          pageUrl: "https://example.com/rules/thin-content-rule",
          effort: "quick",
        },
        {
          ruleId: "aeo/answer-first",
          severity: "warning",
          message: "Opener has no specific numbers, dates, or dollar amounts.",
          fix: "Restructure each page opener to lead with a number + named entity (<100 words).",
          pageUrl: "https://example.com/rules/doorway-pattern-rule",
          effort: "quick",
        },
        {
          ruleId: "aeo/answer-first",
          severity: "warning",
          message: "Opener has no specific numbers, dates, or dollar amounts.",
          fix: "Restructure each page opener to lead with a number + named entity (<100 words).",
          pageUrl: "https://example.com/rules/near-duplicate-rule",
          effort: "quick",
        },
      ],
    });
    const out = formatFixplan(summary, { generatedDate: "2026-04-30" });
    // Template signature should generalise the slug segment.
    expect(out).toContain("× 3 instances");
    // Should mention the slugged template, not the per-page urls in the headline.
    expect(out).toMatch(/`\/rules\/:slug`\s+template/);
    // First-instance + Pages bullets.
    expect(out).toContain("First instance:");
    expect(out).toContain("/rules/thin-content");
    expect(out).toContain("/rules/doorway-pattern");
    expect(out).toContain("/rules/near-duplicate");
    // Only 1 fix-plan item, even though 3 findings rolled up.
    expect(out).toContain("Total: 1 fix-plan item");
  });

  it("renders the Skipped this run section when skippedUrls is non-empty", () => {
    const summary = buildSummary({
      verdict: "caution",
      risk: 30,
      pageCount: 10,
      findings: [
        {
          ruleId: "aeo/citable-facts",
          severity: "warning",
          message: "Only 2 citable facts found.",
          pageUrl: "https://example.com/x",
          effort: "quick",
        },
      ],
    });
    summary.skippedUrls = [
      "https://example.com/login",
      "https://example.com/account",
      "https://example.com/private",
      "https://example.com/internal",
    ];
    summary.diagnostics.auditFindings = [
      {
        ruleId: "audit/skipped-by-policy",
        severity: "info",
        message:
          "Skipped 3 pages from rule evaluation — 1 marked noindex, 2 detected as auth (login/register/etc). First few: a, b, c.",
      },
    ];
    const out = formatFixplan(summary, { generatedDate: "2026-04-30" });
    expect(out).toContain("## Skipped this run");
    expect(out).toContain("1 page skipped (noindex)");
    expect(out).toContain("2 pages skipped (auth-detected)");
    // Remainder (4 total - 3 policy = 1) renders as state-cache.
    expect(out).toContain("1 page skipped (unchanged since prior run)");
  });
});

// ── template bucketing helper ──────────────────────────────────────────
describe("bucketByTemplate — collapses findings by (ruleId, templateSignature)", () => {
  function mk(over: Partial<RuleResult>): RuleResult {
    return {
      ruleId: "aeo/citable-facts",
      severity: "warning",
      message: "msg",
      ...over,
    };
  }

  it("collapses three findings sharing a template signature into one bucket", () => {
    const buckets = bucketByTemplate([
      mk({ pageUrl: "https://ex.com/rules/california-llc-fees" }),
      mk({ pageUrl: "https://ex.com/rules/texas-llc-fees" }),
      mk({ pageUrl: "https://ex.com/rules/florida-llc-fees" }),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].count).toBe(3);
    expect(buckets[0].ruleId).toBe("aeo/citable-facts");
    expect(buckets[0].templateSignature).toBe("/rules/:slug");
  });

  it("keeps findings on different templates as separate buckets", () => {
    const buckets = bucketByTemplate([
      mk({ pageUrl: "https://ex.com/rules/california-llc-fees" }),
      mk({ pageUrl: "https://ex.com/rules/texas-llc-fees" }),
      mk({ pageUrl: "https://ex.com/blog/some-post-here" }),
    ]);
    expect(buckets).toHaveLength(2);
    const sigs = buckets.map((b) => b.templateSignature).sort();
    expect(sigs).toEqual(["/blog/:slug", "/rules/:slug"]);
  });

  it("gives a site-wide finding (no pageUrl) its own bucket", () => {
    const buckets = bucketByTemplate([
      mk({ ruleId: "tech/robots-compliance", pageUrl: undefined }),
      mk({ pageUrl: "https://ex.com/rules/california-llc-fees" }),
    ]);
    expect(buckets).toHaveLength(2);
    const siteWide = buckets.find((b) => b.ruleId === "tech/robots-compliance");
    expect(siteWide).toBeDefined();
    expect(siteWide!.templateSignature).toBeNull();
    expect(siteWide!.representativeUrl).toBe("<site-wide>");
  });

  it("orders buckets by count DESC, then severity DESC", () => {
    const buckets = bucketByTemplate([
      // 1 instance, critical
      mk({
        ruleId: "spam/near-duplicate",
        severity: "critical",
        pageUrl: "https://ex.com/dupes/page-one",
      }),
      // 3 instances, warning
      mk({ pageUrl: "https://ex.com/rules/california-llc-fees" }),
      mk({ pageUrl: "https://ex.com/rules/texas-llc-fees" }),
      mk({ pageUrl: "https://ex.com/rules/florida-llc-fees" }),
      // 2 instances, error
      mk({
        ruleId: "content/unique-value",
        severity: "error",
        pageUrl: "https://ex.com/blog/some-post-one",
      }),
      mk({
        ruleId: "content/unique-value",
        severity: "error",
        pageUrl: "https://ex.com/blog/another-post-two",
      }),
    ]);
    // count DESC: 3, 2, 1.
    expect(buckets.map((b) => b.count)).toEqual([3, 2, 1]);
    // Within count tier the more severe wins; here counts differ, so check ordering directly.
    expect(buckets[0].ruleId).toBe("aeo/citable-facts"); // 3 warning
    expect(buckets[1].ruleId).toBe("content/unique-value"); // 2 error
    expect(buckets[2].ruleId).toBe("spam/near-duplicate"); // 1 critical
  });

  it("respects an enriched templateSignature override on the finding", () => {
    const buckets = bucketByTemplate([
      mk({
        pageUrl: "https://ex.com/some/legacy/url",
        // Engine-supplied signature wins over inference.
        templateSignature: "/legacy/preset",
      } as RuleResult & { templateSignature: string }),
      mk({
        pageUrl: "https://ex.com/totally/different/url",
        templateSignature: "/legacy/preset",
      } as RuleResult & { templateSignature: string }),
    ]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0].templateSignature).toBe("/legacy/preset");
    expect(buckets[0].count).toBe(2);
  });
});

// ── console formatter — bucketed top fixes ─────────────────────────────
describe("formatConsole — template bucketing in top fixes", () => {
  function summaryWithFindings(findings: RuleResult[]): AuditSummary {
    return buildSummary({ verdict: "concerning", risk: 55, findings });
  }

  it("collapses 3 same-template findings into one '× 3 instances on TEMPLATE' line", () => {
    const summary = summaryWithFindings([
      {
        ruleId: "aeo/citable-facts",
        severity: "warning",
        message: "Only 2 citable facts found.",
        fix: "Add 8+ entity-specific facts per page.",
        pageUrl: "https://ex.com/rules/california-llc-fees",
        effort: "quick",
      },
      {
        ruleId: "aeo/citable-facts",
        severity: "warning",
        message: "Only 3 citable facts found.",
        fix: "Add 8+ entity-specific facts per page.",
        pageUrl: "https://ex.com/rules/texas-llc-fees",
        effort: "quick",
      },
      {
        ruleId: "aeo/citable-facts",
        severity: "warning",
        message: "Only 4 citable facts found.",
        fix: "Add 8+ entity-specific facts per page.",
        pageUrl: "https://ex.com/rules/florida-llc-fees",
        effort: "quick",
      },
    ]);
    const out = formatConsole(summary, { noColor: true });
    expect(out).toContain("aeo/citable-facts × 3 instances on /rules/:slug template");
    expect(out).toContain("Fix once, resolve all 3.");
    // Should NOT print all three rule IDs as separate top-fix lines.
    const lines = out.split("\n").filter((l) => l.includes("aeo/citable-facts"));
    expect(lines.length).toBeLessThan(3);
  });

  it("keeps single-instance findings in their existing format (no '× 1' suffix)", () => {
    const summary = summaryWithFindings([
      {
        ruleId: "spam/thin-content",
        severity: "error",
        message: "Page has thin content (50 words).",
        pageUrl: "https://ex.com/page-1",
      },
    ]);
    const out = formatConsole(summary, { noColor: true });
    expect(out).not.toContain("× 1");
    expect(out).not.toContain("Fix once, resolve all 1");
    expect(out).toContain("Page has thin content (50 words).");
  });

  it("uses '× N affected pages' (no template) when bucketed by pageUrl rather than signature", () => {
    // Two findings on the SAME pageUrl with no template signature would bucket
    // by pageUrl. The signature is `/about` (single-segment), still inferred,
    // but template is just the path. Use a root URL where signature == pageUrl
    // path so the template bucket label still makes sense — instead, simulate
    // by using two findings on the SAME concrete pageUrl that the inference
    // returns as the path itself ("__site__"-style fallback path). To force
    // the "affected pages" branch, use site-wide findings on the same rule.
    const summary = summaryWithFindings([
      {
        ruleId: "tech/robots-compliance",
        severity: "warning",
        message: "robots.txt issue",
      },
      {
        ruleId: "tech/robots-compliance",
        severity: "warning",
        message: "robots.txt issue",
      },
    ]);
    const out = formatConsole(summary, { noColor: true });
    // Site-wide findings have null templateSignature → "× 2 affected pages".
    expect(out).toContain("× 2 affected pages");
    expect(out).not.toContain("Fix once, resolve all 2");
  });
});

// ── markdown formatter — bucketed buckets ──────────────────────────────
describe("formatMarkdown — template bucketing in severity sections", () => {
  it("renders a bucket header + 'Fix once, resolve all N' callout for template buckets", () => {
    const summary = buildSummary({
      verdict: "concerning",
      findings: [
        {
          ruleId: "aeo/citable-facts",
          severity: "warning",
          message: "Only 2 citable facts found.",
          fix: "Add 8+ entity-specific facts per page.",
          pageUrl: "https://ex.com/rules/california-llc-fees",
          effort: "quick",
        },
        {
          ruleId: "aeo/citable-facts",
          severity: "warning",
          message: "Only 3 citable facts found.",
          fix: "Add 8+ entity-specific facts per page.",
          pageUrl: "https://ex.com/rules/texas-llc-fees",
          effort: "quick",
        },
        {
          ruleId: "aeo/citable-facts",
          severity: "warning",
          message: "Only 4 citable facts found.",
          fix: "Add 8+ entity-specific facts per page.",
          pageUrl: "https://ex.com/rules/florida-llc-fees",
          effort: "quick",
        },
      ],
    });
    const out = formatMarkdown(summary);
    expect(out).toContain("× 3 instances on `/rules/:slug` template");
    expect(out).toContain("Fix once, resolve all 3");
    // Single H3 rule header for the bucketed group, not three.
    const headerMatches = out.match(/^### .*aeo\/citable-facts/gm) ?? [];
    expect(headerMatches.length).toBe(1);
  });

  it("falls back to the legacy bullet format for single-instance findings", () => {
    const summary = buildSummary({
      verdict: "caution",
      findings: [
        {
          ruleId: "spam/thin-content",
          severity: "error",
          message: "Page has thin content (50 words).",
          pageUrl: "https://example.com/page-1",
        },
      ],
    });
    const out = formatMarkdown(summary);
    // No `### aeo/...` header — single findings stay as bullets.
    expect(out).toMatch(/- \*\*`spam\/thin-content`\*\*/);
    expect(out).not.toContain("× 1");
    expect(out).not.toContain("Fix once, resolve all 1");
  });
});
