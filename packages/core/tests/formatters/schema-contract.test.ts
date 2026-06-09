/**
 * JSON output contract test.
 *
 * Pins the published JSON Schema (`schemas/audit-summary.schema.json`) against
 * the actual shape the JSON formatter emits, so the schema and the
 * `AuditSummary` TypeScript type can't silently drift. If a field is added,
 * renamed, or re-typed in the engine output without updating the schema (and
 * bumping `SCHEMA_VERSION`), this test fails.
 *
 * Uses ajv (draft 2020-12 build) + ajv-formats — both already root devDeps.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  SCHEMA_VERSION,
  type AuditSummary,
  type CategoryGrades,
  type IssueBuckets,
  type RuleResult,
  type Template,
  type Verdict,
} from "../../src/types.js";
import { formatJson } from "../../src/formatters/json.js";

// ── load + compile the published schema ────────────────────────────────
const schemaPath = fileURLToPath(
  new URL("../../schemas/audit-summary.schema.json", import.meta.url),
);
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;

// ajv-formats' default export is callable but typed loosely under NodeNext.
const ajv = new Ajv2020({ allErrors: true, strict: false });
(addFormats as unknown as (a: typeof ajv) => void)(ajv);
const validate = ajv.compile(schema);

// ── representative summary builders (mirror formatters.test.ts buildSummary) ──
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
}): AuditSummary {
  const findings = opts.findings ?? [];
  const issues = bucketize(findings);
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
    pageCount: opts.pageCount ?? findings.length,
    templateDetected: opts.templateDetected,
    rawFindingCount: opts.rawFindingCount,
  } as unknown as AuditSummary;
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
      ruleFireRates: { "spam/thin-content": 0.8 },
      uniformityScore: 0.9,
      topDriver: { ruleId: "spam/thin-content", fireRate: 0.8 },
    },
    findingIds: [],
  };
}

function expectValid(summary: AuditSummary): void {
  const json = JSON.parse(formatJson(summary));
  const ok = validate(json);
  if (!ok) {
    // Surface the precise validation errors when this regresses.
    throw new Error(
      `JSON output failed schema validation:\n${ajv.errorsText(validate.errors, { separator: "\n" })}`,
    );
  }
  expect(ok).toBe(true);
}

// ── tests ──────────────────────────────────────────────────────────────
describe("audit-summary.schema.json — JSON output contract", () => {
  it("schema $id and schemaVersion const both equal the current SCHEMA_VERSION", () => {
    expect(schema.$id).toContain(SCHEMA_VERSION);
    const props = schema.properties as Record<string, { const?: string }>;
    expect(props.schemaVersion.const).toBe(SCHEMA_VERSION);
  });

  it("serialized output carries schemaVersion === SCHEMA_VERSION", () => {
    const parsed = JSON.parse(formatJson(buildSummary({})));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("validates a minimal (no-findings, no-templates) summary", () => {
    expectValid(buildSummary({ verdict: "ready", risk: 5, findings: [] }));
  });

  it("validates a representative summary with severity-bucketed findings", () => {
    expectValid(
      buildSummary({
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
      }),
    );
  });

  it("validates a summary carrying the v0.6 templates[] array", () => {
    const summary = buildSummary({ verdict: "critical", risk: 84, pageCount: 476 });
    (summary as unknown as { templates: Template[] }).templates = [
      makeTemplate("/listing/:slug", "critical"),
      makeTemplate("/category/:slug", "ready"),
    ];
    (summary as unknown as { auditedUrls: string[] }).auditedUrls = [
      "https://example.com/listing/test",
      "https://example.com/category/test",
    ];
    expectValid(summary);
  });

  it("validates a truncated (partial-coverage) summary", () => {
    const summary = buildSummary({ verdict: "concerning", risk: 60, pageCount: 30 });
    (summary as unknown as { truncated: boolean }).truncated = true;
    (summary as unknown as { truncatedReason: string }).truncatedReason =
      "Origin degraded — backpressure watchdog aborted the crawl.";
    expectValid(summary);
  });

  it("REJECTS a flat-array issues shape (the broken consumer assumption)", () => {
    const summary = buildSummary({ findings: [] });
    // A consumer that assumed `issues: RuleResult[]` would produce this.
    (summary as unknown as { issues: unknown }).issues = [
      { ruleId: "spam/thin-content", severity: "error", message: "x" },
    ];
    const json = JSON.parse(formatJson(summary));
    expect(validate(json)).toBe(false);
  });

  it("REJECTS a category-keyed issues shape (the other broken assumption)", () => {
    const summary = buildSummary({ findings: [] });
    (summary as unknown as { issues: unknown }).issues = {
      aeo: [{ ruleId: "aeo/answer-first", severity: "warning", message: "x" }],
    };
    const json = JSON.parse(formatJson(summary));
    expect(validate(json)).toBe(false);
  });

  it("REJECTS a stale schemaVersion", () => {
    const summary = buildSummary({ findings: [] });
    (summary as unknown as { schemaVersion: string }).schemaVersion = "2026-04-v0.4";
    const json = JSON.parse(formatJson(summary));
    expect(validate(json)).toBe(false);
  });
});
