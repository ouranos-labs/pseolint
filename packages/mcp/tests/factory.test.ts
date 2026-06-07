import { describe, it, expect, vi } from "vitest";

// Keep the real SCORED_CATEGORY_KEYS but stub the heavy engine entrypoints so
// this test stays a pure registration check (mirrors server.test.ts).
vi.mock("@pseolint/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pseolint/core")>();
  return {
    ...actual,
    auditSource: vi.fn(),
    orchestrate: vi.fn(),
    formatJson: vi.fn(() => "{}"),
    formatConsole: vi.fn(() => ""),
  };
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadOnlyTools, registerOrchestrateTool, createServer } from "../src/server.js";
import { connect } from "./helpers.js";

async function toolNames(server: McpServer): Promise<string[]> {
  const client = await connect(server);
  const { tools } = await client.listTools();
  return tools.map((t) => t.name).sort();
}

describe("tool factory", () => {
  it("registerReadOnlyTools registers exactly the 3 read-only tools", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    registerReadOnlyTools(server);
    expect(await toolNames(server)).toEqual([
      "pseolint_audit_site",
      "pseolint_check_page_technical",
      "pseolint_explain_score",
    ]);
  });

  it("registerOrchestrateTool registers only the orchestrate tool", async () => {
    const server = new McpServer({ name: "t", version: "0.0.0" });
    registerOrchestrateTool(server);
    expect(await toolNames(server)).toEqual(["pseolint_orchestrate_audit"]);
  });

  it("createServer still registers all 4 tools", async () => {
    expect(await toolNames(createServer())).toEqual([
      "pseolint_audit_site",
      "pseolint_check_page_technical",
      "pseolint_explain_score",
      "pseolint_orchestrate_audit",
    ]);
  });
});
