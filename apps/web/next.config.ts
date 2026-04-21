import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["pseolint", "@pseolint/core"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default config;
