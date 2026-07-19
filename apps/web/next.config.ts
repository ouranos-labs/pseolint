import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pseolint", "@pseolint/core", "@pseolint/mcp", "mcp-handler", "playwright-core"],
  // Next 16: `serverActions` is a stable top-level option (was `experimental.serverActions`
  // in ≤14). Nesting it under `experimental` is ignored on 16, silently dropping the limit.
  serverActions: { bodySizeLimit: "1mb" },
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
};

export default config;
