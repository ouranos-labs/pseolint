import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

// The server reads its size caps from env *once at module load*. Set them before
// the server module is imported (done lazily in beforeAll) so this file proves
// the env knobs actually take effect. Restored in afterAll so the values don't
// leak if the test pool is ever reconfigured to share context across files.
const ENV_KEYS = ["PSEOLINT_MCP_JSON_CHAR_CAP", "PSEOLINT_MCP_FINDINGS_CAP", "PSEOLINT_MCP_CHAR_LIMIT"] as const;
const ENV_SNAPSHOT = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
process.env.PSEOLINT_MCP_JSON_CHAR_CAP = "200";
process.env.PSEOLINT_MCP_FINDINGS_CAP = "2";
process.env.PSEOLINT_MCP_CHAR_LIMIT = "300";
afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ENV_SNAPSHOT[k] === undefined) delete process.env[k];
    else process.env[k] = ENV_SNAPSHOT[k];
  }
});

vi.mock("@pseolint/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pseolint/core")>();
  return { ...actual, auditSource: vi.fn(), orchestrate: vi.fn(), formatJson: vi.fn(), formatConsole: vi.fn() };
});

import { auditSource, formatJson, formatConsole } from "@pseolint/core";
import { connect, textOf, makeSummary, makeFinding, type CallResult } from "./helpers.js";

const mAudit = vi.mocked(auditSource);
const mJson = vi.mocked(formatJson);
const mConsole = vi.mocked(formatConsole);

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
  mJson.mockReturnValue('{"x":1}');
  mConsole.mockReturnValue("short");
  mAudit.mockResolvedValue(makeSummary());
});

describe("env-configurable caps", () => {
  it("honors PSEOLINT_MCP_FINDINGS_CAP", async () => {
    mAudit.mockResolvedValue(makeSummary({
      shouldFix: Array.from({ length: 5 }, (_, i) => makeFinding({ ruleId: `r${i}` })),
    }));
    const r = await call("pseolint_audit_site", { source: "./out" });
    expect((r.structuredContent!.findings as unknown[]).length).toBe(2);
    expect(r.structuredContent!.findingCount).toBe(5);
    expect(r.structuredContent!.findingsTruncated).toBe(true);
  });

  it("honors PSEOLINT_MCP_JSON_CHAR_CAP (small payloads now collapse to the envelope)", async () => {
    mJson.mockReturnValue("z".repeat(500)); // > 200-char cap
    const r = await call("pseolint_audit_site", { source: "https://example.com", format: "json" });
    const parsed = JSON.parse(textOf(r));
    expect(parsed.truncated).toBe(true);
    expect(r.structuredContent!.textTruncated).toBe(true);
  });

  it("honors PSEOLINT_MCP_CHAR_LIMIT for console text", async () => {
    mConsole.mockReturnValue("c".repeat(500)); // > 300-char limit
    const r = await call("pseolint_audit_site", { source: "./out", format: "console" });
    expect(textOf(r)).toContain("[truncated");
    expect(r.structuredContent!.textTruncated).toBe(true);
  });

});
