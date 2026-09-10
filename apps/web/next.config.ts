import type { NextConfig } from "next";
import path from "path";

const config: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingExcludes: {
    "*": [
      "./node_modules/.bun/**",
      "../../node_modules/.bun/**",
      "./.turbo/**",
      "../../.turbo/**",
      "**/.git/**",
    ],
  },
  serverExternalPackages: [
    "pseolint", "@pseolint/core", "@pseolint/mcp", "mcp-handler", "playwright-core",
    // The AI provider SDKs are loaded by core through `import(variableSpecifier)`,
    // which the bundler cannot follow. Marking them external keeps them as plain
    // node_modules requires; `outputFileTracingIncludes` below is what actually
    // gets them into the deployed function.
    "@ai-sdk/anthropic", "@ai-sdk/openai", "@ai-sdk/google", "@ai-sdk/mistral",
    "@ai-sdk/groq", "@ai-sdk/xai", "@ai-sdk/cohere", "ollama-ai-provider-v2",
  ],
  // Without this the untraceable dynamic import silently ships nothing, every
  // provider probes as "not installed", and the dashboard offers a list where
  // everything is disabled - the same class of failure this replaced, just
  // moved from audit time to deploy time.
  outputFileTracingIncludes: {
    "/dashboard/api-keys": ["../../node_modules/@ai-sdk/**/*", "../../node_modules/ollama-ai-provider-v2/**/*"],
    "/api/inngest": ["../../node_modules/@ai-sdk/**/*", "../../node_modules/ollama-ai-provider-v2/**/*"],
  },
  // `serverActions` lives under `experimental` on Next 16: it appears only in
  // `experimentalSchema` in next/dist/server/config-schema.js, and a top-level
  // one makes the build print `Unrecognized key(s) in object: 'serverActions'`,
  // which is how this was found. The comment here previously claimed the
  // reverse, so the limit had been silently dropped ever since. Harmless so far
  // only because 1mb is also the default - change the value and it would not
  // have taken effect.
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
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
