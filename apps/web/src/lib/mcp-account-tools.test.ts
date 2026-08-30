/**
 * Handler-level tests for the two account-scoped MCP tools. The route test
 * covers registration (which tools a keyed vs anonymous caller sees); this
 * covers what the handlers actually return, including every failure branch,
 * since an MCP client only ever sees `content[0].text` and `structuredContent`.
 *
 * The database is stubbed here. The tenant boundary (`eq(audits.userId, ...)`)
 * is NOT asserted by this file, because a JS stub would only be asserting its
 * own reimplementation of the predicate: that check lives against real SQL in
 * tests/integration/mcp-account-tools.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuditSummary } from "@pseolint/core";

const H = vi.hoisted(() => ({
  rows: [] as unknown[],
  summaryJson: null as string | null,
}));

// Drizzle builders are thenables, so one self-returning chain that resolves to
// H.rows stands in for every query shape used here.
vi.mock("@/db", () => {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: unknown) => void) => resolve(H.rows),
  };
  for (const m of ["select", "from", "where", "orderBy", "limit"]) chain[m] = () => chain;
  return { db: chain };
});

vi.mock("@/lib/r2", () => ({
  summaryKey: (id: string) => `reports/${id}.json`,
  fetchSummaryJson: async () => H.summaryJson,
}));

const { registerAccountTools } = await import("@/lib/mcp-account-tools");

type Handler = (args: Record<string, unknown>) => Promise<{
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}>;

/** Collect the registered handlers by name from a stand-in server. */
function tools(userId = "user_a"): Map<string, Handler> {
  const found = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => found.set(name, handler),
  };
  registerAccountTools(server as unknown as McpServer, userId);
  return found;
}

const list = () => tools().get("pseolint_list_audits")!;
const get = () => tools().get("pseolint_get_audit")!;

function auditRow(over: Record<string, unknown> = {}) {
  return {
    id: "aud_1",
    slug: "brave-otter",
    host: "example.com",
    sourceUrl: "https://example.com",
    status: "completed",
    verdict: "caution",
    risk: 44,
    pageCount: 120,
    findingCount: 9,
    storageKey: "reports/aud_1.json",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    completedAt: new Date("2026-08-01T10:04:00Z"),
    ...over,
  };
}

function summaryOf(over: Partial<AuditSummary> = {}): AuditSummary {
  return {
    verdict: "caution",
    risk: 44,
    headline: "Two templates are thin.",
    pageCount: 120,
    templates: [],
    categories: { integrity: { grade: "C", issues: 4 } },
    issues: { blockers: [], shouldFix: [], informational: [] },
    ...over,
  } as unknown as AuditSummary;
}

beforeEach(() => {
  H.rows = [];
  H.summaryJson = null;
});

describe("pseolint_list_audits", () => {
  it("tells an empty account how to create its first audit", async () => {
    const res = await list()({ limit: 10 });
    expect(res.structuredContent).toEqual({ audits: [], count: 0 });
    expect(res.content[0].text).toContain("pseolint_audit_site");
    expect(res.isError).toBeUndefined(); // an empty account is not a failure
  });

  it("says which host came back empty when filtering", async () => {
    const res = await list()({ host: "nope.com", limit: 10 });
    expect(res.content[0].text).toBe("No completed audits for nope.com on this account.");
  });

  it("renders one line per audit and a resolvable report URL", async () => {
    H.rows = [auditRow(), auditRow({ slug: "wise-heron", verdict: "ready", risk: 12 })];
    const res = await list()({ limit: 10 });

    const text = res.content[0].text;
    expect(text).toContain("2 audits on this account");
    expect(text).toContain("brave-otter | example.com | caution (risk 44) | 9 findings");
    expect(text).toContain("pseolint_get_audit"); // points at the follow-up tool

    const rows = res.structuredContent!.audits as { slug: string; reportUrl: string; createdAt: string }[];
    expect(res.structuredContent!.count).toBe(2);
    // BETTER_AUTH_URL is http://localhost:3000 under tests/setup.ts.
    expect(rows[0].reportUrl).toBe("http://localhost:3000/r/brave-otter");
    expect(rows[0].createdAt).toBe("2026-08-01T10:00:00.000Z"); // Dates serialised for JSON transport
  });

  it("does not choke on the null columns legacy rows carry", async () => {
    H.rows = [auditRow({ host: null, verdict: null, risk: null, pageCount: null, findingCount: null })];
    const res = await list()({ limit: 10 });
    expect(res.content[0].text).toContain("brave-otter | https://example.com | ? (risk ?) | ? findings");
  });
});

describe("pseolint_get_audit", () => {
  it("reports an unknown slug as an error, without hinting whether it exists elsewhere", async () => {
    const res = await get()({ slug: "ghost" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('No audit "ghost" on this account');
    expect(res.content[0].text).not.toContain("another");
  });

  it("refuses an audit that has not finished", async () => {
    H.rows = [auditRow({ status: "running" })];
    const res = await get()({ slug: "brave-otter" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("is running, not completed");
  });

  it("points at a re-run when the stored report has expired out of R2", async () => {
    H.rows = [auditRow()];
    H.summaryJson = null;
    const res = await get()({ slug: "brave-otter" });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("expired");
    expect(res.content[0].text).toContain("https://example.com");
  });

  it("does not hit storage for a completed row with no storage key", async () => {
    H.rows = [auditRow({ storageKey: null })];
    H.summaryJson = JSON.stringify(summaryOf()); // would succeed if it were fetched
    const res = await get()({ slug: "brave-otter" });
    expect(res.isError).toBe(true);
  });

  it("returns the markdown report plus fix-ready structured findings", async () => {
    H.rows = [auditRow()];
    H.summaryJson = JSON.stringify(
      summaryOf({
        issues: {
          blockers: [{ ruleId: "content/thin", severity: "error", message: "Thin page", fix: "Add 300 words", effort: "moderate", pageUrl: "https://example.com/a" }],
          shouldFix: [{ ruleId: "tech/canonical", severity: "warn", message: "Missing canonical" }],
          informational: [{ ruleId: "aeo/faq", severity: "info", message: "No FAQ block" }],
        },
      } as unknown as Partial<AuditSummary>),
    );

    const res = await get()({ slug: "brave-otter" });

    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toContain("# pseolint report");
    expect(res.content[0].text).toContain("content/thin");
    expect(res.content[0].text).toContain("Add 300 words"); // the fix, which is what a fixer acts on

    const sc = res.structuredContent!;
    expect(sc.verdict).toBe("caution");
    expect(sc.risk).toBe(44);
    expect(sc.findingCount).toBe(3);
    expect(sc.reportUrl).toBe("http://localhost:3000/r/brave-otter");
    expect(sc.createdAt).toBe("2026-08-01T10:04:00.000Z"); // completedAt wins over createdAt
    // Blockers first, and each finding carries what a fixer needs.
    expect((sc.findings as unknown[])[0]).toEqual({
      ruleId: "content/thin",
      severity: "error",
      message: "Thin page",
      fix: "Add 300 words",
      effort: "moderate",
      pageUrl: "https://example.com/a",
    });
    expect(sc.findingsTruncated).toBeUndefined();
    expect(sc.textTruncated).toBeUndefined();
  });

  it("caps the findings array and flags both truncations on a huge report", async () => {
    // Distinct ruleIds on purpose: the markdown formatter collapses repeats of
    // one rule into a single "× N affected pages" bucket, so same-rule findings
    // never grow the text no matter how many there are.
    const many = Array.from({ length: 200 }, (_, i) => ({
      ruleId: `content/thin-${i}`,
      severity: "error",
      message: `Thin page ${i} `.padEnd(400, "x"),
      pageUrl: `https://example.com/${i}`,
    }));
    H.rows = [auditRow()];
    H.summaryJson = JSON.stringify(
      summaryOf({ issues: { blockers: many, shouldFix: [], informational: [] } } as unknown as Partial<AuditSummary>),
    );

    const res = await get()({ slug: "brave-otter" });
    const sc = res.structuredContent!;

    expect(sc.findingCount).toBe(200);
    expect((sc.findings as unknown[]).length).toBe(60);
    expect(sc.findingsTruncated).toBe(true);
    expect(sc.textTruncated).toBe(true);
    // Truncated text still ends on a pointer to the full report.
    expect(res.content[0].text).toContain("Full report: http://localhost:3000/r/brave-otter");
    expect(res.content[0].text.length).toBeLessThan(26_000);
  });
});
