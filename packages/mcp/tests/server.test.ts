import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the engine so no network/filesystem audit runs; keep everything else
// (SCORED_CATEGORY_KEYS, types) real.
vi.mock("@pseolint/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pseolint/core")>();
  return {
    ...actual,
    auditSource: vi.fn(),
    orchestrate: vi.fn(),
    formatJson: vi.fn(),
    formatConsole: vi.fn(),
  };
});

import { auditSource, orchestrate, formatJson, formatConsole } from "@pseolint/core";
import { createServer } from "../src/server.js";
import {
  connect,
  textOf,
  makeSummary,
  makeFinding,
  makeTemplate,
  makeManifest,
  makeOrchestrateResult,
  type CallResult,
} from "./helpers.js";

const mAudit = vi.mocked(auditSource);
const mOrch = vi.mocked(orchestrate);
const mJson = vi.mocked(formatJson);
const mConsole = vi.mocked(formatConsole);

async function call(name: string, args: Record<string, unknown>): Promise<CallResult> {
  const client = await connect(createServer());
  return (await client.callTool({ name, arguments: args })) as unknown as CallResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  mJson.mockReturnValue('{"format":"json"}');
  mConsole.mockReturnValue("console summary");
  mAudit.mockResolvedValue(makeSummary());
  mOrch.mockResolvedValue(makeOrchestrateResult());
});

describe("tools/list", () => {
  it("exposes the four pseolint_-prefixed tools, each with an outputSchema", async () => {
    const client = await connect(createServer());
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "pseolint_audit_site",
      "pseolint_check_page_technical",
      "pseolint_explain_score",
      "pseolint_orchestrate_audit",
    ]);
    for (const t of tools) expect(t.outputSchema, `${t.name} outputSchema`).toBeTruthy();
  });

  it("sets correct annotations on all four tools", async () => {
    const client = await connect(createServer());
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    expect(byName["pseolint_audit_site"]).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: true });
    expect(byName["pseolint_explain_score"]).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: true });
    expect(byName["pseolint_check_page_technical"]).toMatchObject({ readOnlyHint: true, idempotentHint: true, openWorldHint: false });
    expect(byName["pseolint_orchestrate_audit"]).toMatchObject({ readOnlyHint: true, idempotentHint: false, openWorldHint: true });
  });
});

describe("pseolint_audit_site", () => {
  it("returns schema-valid structuredContent and passes when risk < threshold", async () => {
    mAudit.mockResolvedValue(makeSummary({ risk: 20 }));
    const r = await call("pseolint_audit_site", { source: "./out", threshold: 40 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ verdict: "caution", risk: 20, passed: true, threshold: 40 });
  });

  it("does NOT set isError when the site fails the threshold (passed=false instead)", async () => {
    mAudit.mockResolvedValue(makeSummary({ risk: 80 }));
    const r = await call("pseolint_audit_site", { source: "./out", threshold: 40 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ passed: false, risk: 80 });
  });

  it("treats risk EXACTLY at the threshold as failing (boundary: passed = risk < threshold)", async () => {
    mAudit.mockResolvedValue(makeSummary({ risk: 40 }));
    const r = await call("pseolint_audit_site", { source: "./out", threshold: 40 });
    expect(r.structuredContent!.passed).toBe(false);
  });

  it("filters structured categories to the four scored buckets (drops the audit diagnostics bucket)", async () => {
    const r = await call("pseolint_audit_site", { source: "./out" });
    expect(Object.keys(r.structuredContent!.categories as object).sort()).toEqual([
      "citation", "data", "discoverability", "integrity",
    ]);
  });

  it("caps structured findings and flags findingsTruncated while reporting the true total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => makeFinding({ ruleId: `spam/r${i}`, message: `m${i}` }));
    mAudit.mockResolvedValue(makeSummary({ shouldFix: many }));
    const r = await call("pseolint_audit_site", { source: "./out" });
    expect((r.structuredContent!.findings as unknown[]).length).toBe(100);
    expect(r.structuredContent!.findingCount).toBe(150);
    expect(r.structuredContent!.findingsTruncated).toBe(true);
  });

  it("does NOT flag truncation at exactly the findings cap (boundary)", async () => {
    const exactly = Array.from({ length: 100 }, (_, i) => makeFinding({ ruleId: `spam/r${i}` }));
    mAudit.mockResolvedValue(makeSummary({ shouldFix: exactly }));
    const r = await call("pseolint_audit_site", { source: "./out" });
    expect((r.structuredContent!.findings as unknown[]).length).toBe(100);
    expect(r.structuredContent!.findingsTruncated).toBeUndefined();
  });

  it("DOES flag truncation at one over the cap (boundary)", async () => {
    const overByOne = Array.from({ length: 101 }, (_, i) => makeFinding({ ruleId: `spam/r${i}` }));
    mAudit.mockResolvedValue(makeSummary({ shouldFix: overByOne }));
    const r = await call("pseolint_audit_site", { source: "./out" });
    expect((r.structuredContent!.findings as unknown[]).length).toBe(100);
    expect(r.structuredContent!.findingsTruncated).toBe(true);
  });

  it("includes per-template data when templates are present", async () => {
    mAudit.mockResolvedValue(makeSummary({ templates: [makeTemplate()] }));
    const r = await call("pseolint_audit_site", { source: "./out", format: "json" });
    const templates = r.structuredContent!.templates as Array<Record<string, unknown>>;
    expect(templates).toHaveLength(1);
    expect(templates[0]).toMatchObject({ signature: "/listing/:slug", auditedUrlCount: 2, verdict: "concerning" });
  });

  it("surfaces schemaVersion in structured output", async () => {
    const r = await call("pseolint_audit_site", { source: "./out" });
    expect(r.structuredContent!.schemaVersion).toBe("2026-06-v0.6");
  });

  it("omits truncated fields on a complete run", async () => {
    const r = await call("pseolint_audit_site", { source: "./out" });
    expect(r.structuredContent).not.toHaveProperty("truncated");
    expect(r.structuredContent).not.toHaveProperty("truncatedReason");
  });

  it("surfaces truncated + truncatedReason in structured output and a warning in text when the crawl aborts mid-run", async () => {
    mAudit.mockResolvedValue(makeSummary({ truncated: true, truncatedReason: "origin degraded mid-crawl" }));
    const r = await call("pseolint_audit_site", { source: "https://flaky.example", format: "console" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ truncated: true, truncatedReason: "origin degraded mid-crawl" });
    expect(textOf(r)).toContain("Partial audit");
  });

  describe("output size bounding", () => {
    it("leaves small JSON intact and unflagged", async () => {
      mJson.mockReturnValue('{"real":"json","n":1}');
      const r = await call("pseolint_audit_site", { source: "./out", format: "json" });
      expect(JSON.parse(textOf(r))).toEqual({ real: "json", n: 1 });
      expect(r.structuredContent!.textTruncated).toBeUndefined();
    });

    it("collapses oversized JSON to a valid, findings-free envelope (never malformed)", async () => {
      mJson.mockReturnValue("x".repeat(200_000)); // exceeds default 100k cap
      mAudit.mockResolvedValue(makeSummary({
        shouldFix: Array.from({ length: 30 }, (_, i) => makeFinding({ ruleId: `r${i}` })),
      }));
      const r = await call("pseolint_audit_site", { source: "https://example.com", format: "json" });
      const out = textOf(r);
      const parsed = JSON.parse(out); // must not throw
      expect(parsed.truncated).toBe(true);
      expect("findings" in parsed.summary).toBe(false); // envelope is findings-free
      expect(parsed.summary.verdict).toBe("caution");
      expect(r.structuredContent!.textTruncated).toBe(true);
      // envelope must actually be SMALL, not just findings-free (the bug found in review)
      expect(out.length).toBeLessThan(5_000);
      // findings still available via structuredContent
      expect((r.structuredContent!.findings as unknown[]).length).toBe(30);
    });

    it("truncates oversized console text with a marker AND actually bounds the length", async () => {
      mConsole.mockReturnValue("y".repeat(60_000)); // far exceeds default 25k char limit
      const r = await call("pseolint_audit_site", { source: "./out", format: "console" });
      const out = textOf(r);
      expect(out).toContain("[truncated");
      expect(r.structuredContent!.textTruncated).toBe(true);
      // head (25k) + truncation marker + hint; comfortably under the raw 60k
      expect(out.length).toBeLessThan(26_000);
    });
  });

  it("forwards authorityScore, sampleSeed and explicit sampleSize into AuditOptions with safeMode saas", async () => {
    await call("pseolint_audit_site", { source: "./out", authorityScore: 90, sampleSeed: 7, sampleSize: 25 });
    expect(mAudit).toHaveBeenCalledWith("./out", expect.objectContaining({
      safeMode: "saas", authorityScore: 90, sampleSeed: 7, sampleSize: 25,
    }));
  });

  it("defaults sampleSize to the MCP page cap when not provided, and omits the optional hints", async () => {
    await call("pseolint_audit_site", { source: "./out" });
    const opts = mAudit.mock.calls[0][1]!;
    expect(opts.sampleSize).toBe(50);
    expect(opts).not.toHaveProperty("authorityScore");
    expect(opts).not.toHaveProperty("sampleSeed");
  });

  it("reports out-of-range threshold as an input-validation error", async () => {
    const r = await call("pseolint_audit_site", { source: "./out", threshold: 999 });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/Invalid arguments|too_big|<=\s*100/);
    expect(mAudit).not.toHaveBeenCalled();
  });

  it("returns isError with a friendly message when the audit throws", async () => {
    mAudit.mockRejectedValue(new Error("disk on fire"));
    const r = await call("pseolint_audit_site", { source: "./out" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("disk on fire");
  });

  it("maps a connection error to actionable guidance", async () => {
    mAudit.mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));
    const r = await call("pseolint_audit_site", { source: "http://localhost:3000" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("make sure it is running");
  });

  it("maps a timeout error to actionable guidance", async () => {
    mAudit.mockRejectedValue(new Error("ETIMEDOUT"));
    const r = await call("pseolint_audit_site", { source: "https://slow.example" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("timed out");
  });

  it("maps a missing-directory error to actionable guidance", async () => {
    mAudit.mockRejectedValue(new Error("Unable to access source"));
    const r = await call("pseolint_audit_site", { source: "./nope" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("Directory not found");
  });

  it("reports a missing required `source` as an input-validation error", async () => {
    const r = await call("pseolint_audit_site", {});
    expect(r.isError).toBe(true);
    expect(mAudit).not.toHaveBeenCalled();
  });

  it("appends the page-cap note when the sample hit the cap and no explicit sampleSize was given", async () => {
    mAudit.mockResolvedValue(makeSummary({ pageCount: 50 }));
    const r = await call("pseolint_audit_site", { source: "https://big.example", format: "console" });
    expect(textOf(r)).toContain("Results capped to 50 pages");
  });

  it("omits the page-cap note when an explicit sampleSize was provided", async () => {
    mAudit.mockResolvedValue(makeSummary({ pageCount: 50 }));
    const r = await call("pseolint_audit_site", { source: "https://big.example", sampleSize: 50, format: "console" });
    expect(textOf(r)).not.toContain("Results capped");
  });
});

describe("pseolint_explain_score", () => {
  it("orders top rules by fix effort (quick before structural) and sorts unknown efforts last", async () => {
    mAudit.mockResolvedValue(makeSummary({
      shouldFix: [
        makeFinding({ ruleId: "rule/structural", effort: "structural" }),
        makeFinding({ ruleId: "rule/unknown", effort: "epic" }),  // unrecognised → must sort last
        makeFinding({ ruleId: "rule/quick", effort: "quick" }),
      ],
    }));
    const r = await call("pseolint_explain_score", { source: "./out" });
    const ids = (r.structuredContent!.topRules as Array<{ ruleId: string }>).map((x) => x.ruleId);
    expect(ids).toEqual(["rule/quick", "rule/structural", "rule/unknown"]);
  });

  it("reports threshold failure via passed, not isError", async () => {
    mAudit.mockResolvedValue(makeSummary({ risk: 90 }));
    const r = await call("pseolint_explain_score", { source: "./out", threshold: 40 });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ passed: false });
    expect(Object.keys(r.structuredContent!.categories as object).sort()).toEqual([
      "citation", "data", "discoverability", "integrity",
    ]);
  });

  it("caps topRules at the driver limit (10)", async () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => makeFinding({ ruleId: `rule/r${i}`, effort: "quick" }));
    mAudit.mockResolvedValue(makeSummary({ shouldFix: fifteen }));
    const r = await call("pseolint_explain_score", { source: "./out" });
    expect((r.structuredContent!.topRules as unknown[]).length).toBe(10);
  });

  it("forwards authorityScore/sampleSeed and pins sampleSize to the MCP cap", async () => {
    await call("pseolint_explain_score", { source: "./out", authorityScore: 55, sampleSeed: 3 });
    expect(mAudit).toHaveBeenCalledWith("./out", expect.objectContaining({
      safeMode: "saas", sampleSize: 50, authorityScore: 55, sampleSeed: 3,
    }));
  });

  it("renders real buildExplanation text including a per-template breakdown", async () => {
    mAudit.mockResolvedValue(makeSummary({
      templates: [
        makeTemplate({ signature: "/a/:id", verdict: "concerning", risk: 60 }),
        makeTemplate({ signature: "/b/:id", verdict: "ready", risk: 10 }),
      ],
    }));
    const r = await call("pseolint_explain_score", { source: "./out" });
    const text = textOf(r);
    expect(text).toContain("pseolint Verdict:");
    expect(text).toContain("Per-template breakdown:");
    expect(text).toContain("/a/:id");
  });

  it("renders every verdict label (ready/critical) in the explanation header", async () => {
    mAudit.mockResolvedValue(makeSummary({ verdict: "ready", risk: 5 }));
    expect(textOf(await call("pseolint_explain_score", { source: "./out" }))).toContain("pseolint Verdict: Ready");
    mAudit.mockResolvedValue(makeSummary({ verdict: "critical", risk: 95 }));
    expect(textOf(await call("pseolint_explain_score", { source: "./out" }))).toContain("pseolint Verdict: Critical");
  });

  it("surfaces template-detection and rule-suppression notes when present", async () => {
    const summary = makeSummary({ templateDetected: true });
    summary.siteClassification = { type: "small-marketing", confidence: 0.7, suppressedRules: ["spam/doorway-pattern", "spam/entity-swap"] };
    mAudit.mockResolvedValue(summary);
    const r = await call("pseolint_explain_score", { source: "./out" });
    const text = textOf(r);
    expect(text).toContain("Template-generated content detected");
    expect(text).toContain("Suppressed 2 rules");
  });

  it("surfaces schemaVersion in structured output", async () => {
    const r = await call("pseolint_explain_score", { source: "./out" });
    expect(r.structuredContent!.schemaVersion).toBe("2026-06-v0.6");
  });

  it("surfaces truncated + truncatedReason in structured output and prepends a warning to the explanation text", async () => {
    mAudit.mockResolvedValue(makeSummary({ truncated: true, truncatedReason: "origin degraded mid-crawl" }));
    const r = await call("pseolint_explain_score", { source: "https://flaky.example" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ truncated: true, truncatedReason: "origin degraded mid-crawl" });
    expect(textOf(r)).toContain("Partial audit");
  });

  it("returns isError with a friendly message when the audit throws", async () => {
    mAudit.mockRejectedValue(new Error("kaboom"));
    const r = await call("pseolint_explain_score", { source: "./out" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("kaboom");
  });
});

describe("pseolint_check_page_technical", () => {
  it("returns only per-page findings (filters cross-page rules)", async () => {
    mAudit.mockResolvedValue(makeSummary({
      shouldFix: [
        makeFinding({ ruleId: "tech/canonical-consistency" }), // per-page → kept
        makeFinding({ ruleId: "spam/near-duplicate" }),        // cross-page → dropped
      ],
    }));
    const r = await call("pseolint_check_page_technical", { url: "https://example.com/p" });
    const ids = (r.structuredContent!.findings as Array<{ ruleId: string }>).map((x) => x.ruleId);
    expect(ids).toEqual(["tech/canonical-consistency"]);
    expect(r.structuredContent!.issueCount).toBe(1);
  });

  it("disables crawl discovery for single-page checks", async () => {
    await call("pseolint_check_page_technical", { url: "https://example.com/p" });
    expect(mAudit).toHaveBeenCalledWith("https://example.com/p", expect.objectContaining({
      crawlDiscovery: false, safeMode: "saas",
    }));
  });

  it("filters every cross-page rule, keeping only per-page findings", async () => {
    const crossPage = [
      "spam/near-duplicate", "spam/entity-swap", "spam/doorway-pattern",
      "content/unique-value", "cannibal/url-pattern", "links/orphan-pages",
    ];
    mAudit.mockResolvedValue(makeSummary({
      shouldFix: [
        ...crossPage.map((ruleId) => makeFinding({ ruleId })),
        makeFinding({ ruleId: "tech/og-completeness" }), // per-page → kept
      ],
    }));
    const r = await call("pseolint_check_page_technical", { url: "https://example.com/p" });
    const ids = (r.structuredContent!.findings as Array<{ ruleId: string }>).map((x) => x.ruleId);
    expect(ids).toEqual(["tech/og-completeness"]);
  });

  it("reports the clean-page path when there are no per-page findings", async () => {
    mAudit.mockResolvedValue(makeSummary({
      shouldFix: [makeFinding({ ruleId: "spam/near-duplicate" })], // only cross-page
    }));
    const r = await call("pseolint_check_page_technical", { url: "https://example.com/p" });
    expect(r.structuredContent!.issueCount).toBe(0);
    expect(textOf(r)).toContain("No technical SEO issues found");
  });

  it("surfaces schemaVersion in structured output", async () => {
    const r = await call("pseolint_check_page_technical", { url: "https://example.com/p" });
    expect(r.structuredContent!.schemaVersion).toBe("2026-06-v0.6");
  });

  it("reports a non-URL argument as an input-validation error", async () => {
    const r = await call("pseolint_check_page_technical", { url: "not a url" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/Invalid arguments|url|URL/);
    expect(mAudit).not.toHaveBeenCalled();
  });

  it("returns isError with a friendly message when the check throws", async () => {
    mAudit.mockRejectedValue(new Error("page blew up"));
    const r = await call("pseolint_check_page_technical", { url: "https://example.com/p" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("page blew up");
  });
});

describe("pseolint_orchestrate_audit", () => {
  it("returns a completed=true structured summary on success without isError", async () => {
    const r = await call("pseolint_orchestrate_audit", { domain: "https://example.com" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({
      reason: "completed",
      completed: true,
      verdict: "caution",
      categories: { integrity: "B", discoverability: "A", citation: "C", data: "A" },
      patches: { valid: 3, total: 4, dropped: 1 },
      pageCount: 1, templateCount: 1, domainLevelCount: 1,
    });
  });

  it("projects usage to exactly the three declared fields (no token-count leakage)", async () => {
    // makeOrchestrateResult's usage carries inputTokens/outputTokens too; they
    // must be projected away or the strict outputSchema would reject the result.
    const r = await call("pseolint_orchestrate_audit", { domain: "https://example.com" });
    expect(Object.keys(r.structuredContent!.usage as object).sort()).toEqual([
      "elapsedMs", "estimatedUsd", "toolCallCount",
    ]);
  });

  it("renders the real buildOrchestrateSummary text (default summary format)", async () => {
    const r = await call("pseolint_orchestrate_audit", { domain: "https://example.com" });
    const text = textOf(r);
    expect(text).toContain("pseolint orchestrate · reason=completed");
    expect(text).toContain("verdict: caution");
    expect(text).toMatch(/Page-level patches/);
    expect(text).toMatch(/Template-level patches/);
    expect(text).toMatch(/Domain-level patches/);
  });

  it("treats an early stop (real StopReason) as a successful call, no isError", async () => {
    mOrch.mockResolvedValue(makeOrchestrateResult({ reason: "usd_limit", manifest: null, validation: null }));
    const r = await call("pseolint_orchestrate_audit", { domain: "https://example.com" });
    expect(r.isError).toBeFalsy();
    expect(r.structuredContent).toMatchObject({ reason: "usd_limit", completed: false });
    expect(r.structuredContent).not.toHaveProperty("verdict"); // no manifest → no manifest fields
    expect(textOf(r)).toContain("No manifest produced");
  });

  it("emits the full manifest as valid JSON when format=json (intentionally unbounded)", async () => {
    const r = await call("pseolint_orchestrate_audit", { domain: "https://example.com", format: "json" });
    const parsed = JSON.parse(textOf(r));
    expect(parsed.session.reason).toBe("completed");
    expect(parsed.manifest.domain).toBe("https://example.com");
    expect(parsed).not.toHaveProperty("truncated"); // not enveloped
  });

  it("forwards the budget caps to orchestrate()", async () => {
    await call("pseolint_orchestrate_audit", {
      domain: "https://example.com", maxCostUsd: 3, maxToolCalls: 10, maxWallSeconds: 30,
    });
    expect(mOrch).toHaveBeenCalledWith(expect.objectContaining({
      domain: "https://example.com",
      userId: "mcp",
      budget: expect.objectContaining({ maxSessionUsd: 3, maxToolCalls: 10, maxWallSeconds: 30 }),
    }));
  });

  it("enforces MCP-surface budget ceilings (cost) and floors (wall seconds)", async () => {
    const tooExpensive = await call("pseolint_orchestrate_audit", { domain: "https://x.com", maxCostUsd: 999 });
    expect(tooExpensive.isError).toBe(true);
    expect(textOf(tooExpensive)).toMatch(/too_big|<=\s*50/);

    const tooShort = await call("pseolint_orchestrate_audit", { domain: "https://x.com", maxWallSeconds: 5 });
    expect(tooShort.isError).toBe(true);
    expect(textOf(tooShort)).toMatch(/too_small|>=\s*10/);

    expect(mOrch).not.toHaveBeenCalled();
  });

  it("returns isError when the orchestrator throws", async () => {
    mOrch.mockRejectedValue(new Error("model exploded"));
    const r = await call("pseolint_orchestrate_audit", { domain: "https://example.com" });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("model exploded");
  });

  it("reports a missing required `domain` as an input-validation error", async () => {
    const r = await call("pseolint_orchestrate_audit", {});
    expect(r.isError).toBe(true);
    expect(mOrch).not.toHaveBeenCalled();
  });

  it("summarizes an empty manifest as 'nothing actionable'", async () => {
    mOrch.mockResolvedValue(makeOrchestrateResult({
      manifest: makeManifest({ pages: [], templates: [], domainLevel: [] }),
      validation: { validPatches: 0, totalPatches: 0, failures: [] },
    }));
    const r = await call("pseolint_orchestrate_audit", { domain: "https://example.com" });
    expect(textOf(r)).toContain("Manifest is empty");
    expect(r.structuredContent).toMatchObject({ pageCount: 0, templateCount: 0, domainLevelCount: 0 });
  });

  it("collapses long patch buckets with an '… and N more' line", async () => {
    mOrch.mockResolvedValue(makeOrchestrateResult({
      manifest: makeManifest({
        pages: Array.from({ length: 5 }, (_, i) => ({ url: `https://example.com/${i}`, changes: [{ type: "rewrite-h1" }] })),
      }),
    }));
    const r = await call("pseolint_orchestrate_audit", { domain: "https://example.com" });
    expect(textOf(r)).toContain("and 2 more"); // 5 pages, top 3 shown
  });
});
