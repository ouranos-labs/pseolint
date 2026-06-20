import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
// NO vi.mock here — this suite runs the REAL engine (auditSource, formatJson,
// formatConsole) against a static fixture in filesystem mode (no network), so
// it catches core↔MCP drift that the mocked suite cannot.
import { createServer } from "../src/server.js";
import { connect, textOf, type CallResult } from "./helpers.js";

// packages/core/calibration/fixtures/airbyte_com — 24 static HTML pages.
const FIXTURE = fileURLToPath(new URL("../../core/calibration/fixtures/airbyte_com", import.meta.url));

const VERDICTS = ["ready", "caution", "concerning", "critical"];

async function call(name: string, args: Record<string, unknown>): Promise<CallResult> {
  const client = await connect(createServer());
  return (await client.callTool({ name, arguments: args })) as unknown as CallResult;
}

// The airbyte_com fixture's full formatJson payload exceeds the default 100k
// MCP JSON char cap, which would replace the text with a {truncated:true} marker
// (no verdict) and fail the formatJson assertion below. Raise the cap for this
// suite so the real-engine JSON path is exercised end to end.
beforeAll(() => {
  process.env.PSEOLINT_MCP_JSON_CHAR_CAP = "150000";
});

afterAll(() => {
  delete process.env.PSEOLINT_MCP_JSON_CHAR_CAP;
});

describe("integration (real engine, filesystem fixture)", () => {
  it("audits a real fixture and returns schema-valid structured data", async () => {
    const r = await call("pseolint_audit_site", { source: FIXTURE, format: "json" });
    expect(r.isError).toBeFalsy();
    const s = r.structuredContent!;
    expect(VERDICTS).toContain(s.verdict);
    expect(typeof s.risk).toBe("number");
    expect(s.risk as number).toBeGreaterThanOrEqual(0);
    expect(s.risk as number).toBeLessThanOrEqual(100);
    expect(s.pageCount as number).toBeGreaterThan(0);

    // categories: exactly the four scored buckets, audit excluded
    expect(Object.keys(s.categories as object).sort()).toEqual([
      "citation", "data", "discoverability", "integrity",
    ]);

    // findings produced by the REAL mappers must satisfy the published shape
    const findings = s.findings as Array<Record<string, unknown>>;
    expect(Array.isArray(findings)).toBe(true);
    expect(typeof s.findingCount).toBe("number");
    for (const f of findings) {
      expect(typeof f.ruleId).toBe("string");
      expect(typeof f.severity).toBe("string");
      expect(typeof f.message).toBe("string");
    }
  }, 30_000);

  it("emits real, parseable formatJson as the text payload", async () => {
    const r = await call("pseolint_audit_site", { source: FIXTURE, format: "json" });
    const parsed = JSON.parse(textOf(r)); // real formatJson output must be valid JSON
    expect(parsed).toHaveProperty("verdict");
    expect(parsed).toHaveProperty("risk");
  }, 30_000);

  it("renders a real human-readable console report", async () => {
    const r = await call("pseolint_audit_site", { source: FIXTURE, format: "console" });
    const text = textOf(r);
    expect(text.length).toBeGreaterThan(100);
    // v0.4 console formatter uses the verdict ladder and intentionally never
    // prints the numeric risk to humans — assert on what it actually emits.
    expect(text).toMatch(/pseolint/i);
    expect(text).toMatch(/fix|blocker|finding/i);
  }, 30_000);

  it("explain_score runs the real buildExplanation against real findings", async () => {
    const r = await call("pseolint_explain_score", { source: FIXTURE });
    const text = textOf(r);
    expect(text).toContain("pseolint Verdict:");
    expect(text).toContain("Pages analysed:");
    expect(text).toContain("Category breakdown:");
    const s = r.structuredContent!;
    expect(VERDICTS).toContain(s.verdict);
    expect(Array.isArray(s.topRules)).toBe(true);
  }, 30_000);
});
