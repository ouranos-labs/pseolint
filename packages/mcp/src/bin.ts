#!/usr/bin/env node
import { startMcpServer } from "./server.js";
startMcpServer().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
