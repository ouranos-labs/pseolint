import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

// Proves `envInt` falls back to the default when the env value is non-numeric,
// rather than silently disabling the cap. Isolated in its own file because the
// server reads the cap once at module load.
const PRIOR = process.env.PSEOLINT_MCP_FINDINGS_CAP;
process.env.PSEOLINT_MCP_FINDINGS_CAP = "not-a-number";
afterAll(() => {
  if (PRIOR === undefined) delete process.env.PSEOLINT_MCP_FINDINGS_CAP;
  else process.env.PSEOLINT_MCP_FINDINGS_CAP = PRIOR;
});

vi.mock("@pseolint/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pseolint/core")>();
  return { ...actual, auditSource: vi.fn(), orchestrate: vi.fn(), formatJson: vi.fn(), formatConsole: vi.fn() };
});

import { auditSource, formatJson, formatConsole } from "@pseolint/core";
import { connect, makeSummary, makeFinding, type CallResult } from "./helpers.js";

const mAudit = vi.mocked(auditSource);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createServer: () => any;
beforeAll(async () => {
  ({ createServer } = await import("../src/server.js"));
});

async function call(name: string, args: Record<string, unknown>): Promise<CallResult> {
  const client = await connect(createServer());
  return (await client.callTool({ name, arguments: args })) as unknown as CallResult;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(formatJson).mockReturnValue('{"x":1}');
  vi.mocked(formatConsole).mockReturnValue("short");
  mAudit.mockResolvedValue(makeSummary());
});

describe("envInt fallback on invalid value", () => {
  it("ignores a non-numeric PSEOLINT_MCP_FINDINGS_CAP and uses the default (100)", async () => {
    mAudit.mockResolvedValue(makeSummary({
      shouldFix: Array.from({ length: 150 }, (_, i) => makeFinding({ ruleId: `r${i}` })),
    }));
    const r = await call("pseolint_audit_site", { source: "./out" });
    // default cap of 100 applies — proves "not-a-number" was rejected, not treated as 0/NaN
    expect((r.structuredContent!.findings as unknown[]).length).toBe(100);
    expect(r.structuredContent!.findingCount).toBe(150);
  });
});
