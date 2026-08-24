import { z } from "zod";
import { cachedFetch } from "../../cache.js";
import { validateTargetHost } from "../../ssrf-guard.js";
import {
  parseDisallowPatterns,
  isBlockedByPattern,
  parseCrawlDelaySeconds,
} from "../../rules/tech/robots-sitemap-presence.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  origin: z
    .string()
    .url()
    .describe("Site origin (e.g. https://example.com). The tool fetches /robots.txt."),
  testUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional URL to test against the robots.txt rules. Returns whether it would be blocked for the wildcard user agent.",
    ),
  userAgent: z
    .string()
    .optional()
    .describe(
      "User agent to evaluate rules against. Default '*'. Pass 'GPTBot' / 'ClaudeBot' / 'PerplexityBot' to test AI-crawler-specific rules.",
    ),
  timeoutMs: z.number().int().positive().max(15_000).optional(),
});

const outputSchema = z.object({
  origin: z.string(),
  robotsTxtUrl: z.string(),
  robotsTxtPresent: z.boolean(),
  disallowPatterns: z.array(z.string()),
  crawlDelaySeconds: z.number().int().nonnegative(),
  hasSitemapDirective: z.boolean(),
  testUrlBlocked: z.boolean().nullable(),
});

/**
 * General-purpose robots.txt fetch + parse + URL test. Wraps the existing
 * `parseDisallowPatterns`, `isBlockedByPattern`, and `parseCrawlDelaySeconds`
 * primitives. The AI-crawler-specific check lives in
 * `check_domain_crawler_access`; this is the lower-level building block.
 */
export const checkRobotsTool = defineTool({
  name: "check_robots",
  description:
    "Fetch and parse a domain's robots.txt. Returns disallow patterns, crawl-delay, and whether a Sitemap directive is present. Pass `testUrl` to check whether a specific URL would be blocked for the named user agent (default '*'). Use this when the orchestrator needs to know if a candidate URL is fetchable before scheduling fetch_page.",
  inputSchema,
  outputSchema,
  async execute({ origin, testUrl, userAgent = "*", timeoutMs = 10_000 }, ctx) {
    const robotsUrl = `${new URL(origin).origin}/robots.txt`;
    const validateHop = async (hopUrl: string): Promise<void> => {
      let host: string;
      try {
        host = new URL(hopUrl).hostname;
      } catch {
        throw new Error(`check_robots: invalid URL ${hopUrl}`);
      }
      await validateTargetHost(host);
    };

    let robotsTxtContent = "";
    let robotsTxtPresent = false;
    try {
      const res = await cachedFetch(robotsUrl, { timeoutMs, cache: null, validateHop, signal: ctx?.signal });
      if (res.status >= 200 && res.status < 300) {
        robotsTxtContent = res.body;
        robotsTxtPresent = true;
      }
    } catch {
      // robots.txt absent or unreachable: caller decides what to do.
    }

    const disallowPatterns = robotsTxtPresent ? parseDisallowPatterns(robotsTxtContent, [userAgent]) : [];
    const crawlDelaySeconds = robotsTxtPresent ? parseCrawlDelaySeconds(robotsTxtContent) : 0;
    const hasSitemapDirective = robotsTxtPresent && /^\s*sitemap\s*:/gim.test(robotsTxtContent);

    let testUrlBlocked: boolean | null = null;
    if (testUrl) {
      try {
        const path = new URL(testUrl).pathname || "/";
        testUrlBlocked = disallowPatterns.some((p) => isBlockedByPattern(path, p));
      } catch {
        testUrlBlocked = null;
      }
    }

    return {
      origin: new URL(origin).origin,
      robotsTxtUrl: robotsUrl,
      robotsTxtPresent,
      disallowPatterns,
      crawlDelaySeconds,
      hasSitemapDirective,
      testUrlBlocked,
    };
  },
});
