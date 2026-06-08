import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// Generate at build time and serve from the CDN — never a cold-starting
// serverless function. GSC crawl stats showed "robots.txt not available" 2.69%
// of the time, which makes Googlebot throttle crawling; a static asset is
// always a fast 200. Content depends only on the build-time canonical host.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const base = env().BETTER_AUTH_URL.replace(/\/$/, "");
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/r/",
          "/a/",
          "/api/",
          "/dashboard/",
          "/signin",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
