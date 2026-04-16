export { runCli } from "./cli.js";
export { startMcpServer } from "./mcp.js";
export * from "@pseolint/core";

import type { AuditOptions } from "@pseolint/core";

export function defineConfig(config: AuditOptions): AuditOptions {
  return config;
}
