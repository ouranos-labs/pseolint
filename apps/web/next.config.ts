import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pseolint", "@pseolint/core", "@pseolint/mcp", "mcp-handler"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
};

export default config;
