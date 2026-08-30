import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pseolint", "@pseolint/core", "@pseolint/mcp", "mcp-handler", "playwright-core"],
  // Next 16: `serverActions` is a stable top-level option (was `experimental.serverActions`
  // in ≤14). Nesting it under `experimental` is ignored on 16, silently dropping the limit.
  serverActions: { bodySizeLimit: "1mb" },
  async rewrites() {
    return [{ source: "/mcp", destination: "/api/mcp" }];
  },
  // Credential management was consolidated onto /dashboard/api-keys. These two
  // routes are gone, but /dashboard/settings/tokens shipped in a published CLI
  // changelog, so both keep forwarding rather than 404ing a bookmarked URL.
  async redirects() {
    return [
      { source: "/dashboard/settings/tokens", destination: "/dashboard/api-keys", permanent: true },
      { source: "/dashboard/settings/ai-key", destination: "/dashboard/api-keys", permanent: true },
    ];
  },
};

export default config;
