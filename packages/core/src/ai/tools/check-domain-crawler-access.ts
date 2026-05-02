import { z } from "zod";
import { crawlerAccessRule } from "../../rules/aeo/crawler-access.js";
import { cachedFetch } from "../../cache.js";
import { validateTargetHost } from "../../ssrf-guard.js";
import { defineTool } from "./types.js";

const inputSchema = z.object({
  origin: z
    .string()
    .url()
    .describe("Site origin (e.g. https://example.com). The tool fetches /robots.txt."),
  timeoutMs: z.number().int().positive().max(15_000).optional(),
});

const outputSchema = z.object({
  origin: z.string(),
  robotsTxtUrl: z.string(),
  robotsTxtPresent: z.boolean(),
  findings: z.array(
    z.object({
      ruleId: z.literal("aeo/crawler-access"),
      severity: z.enum(["info", "warning", "error", "critical"]),
      message: z.string(),
      fix: z.string().optional(),
    }),
  ),
});

/**
 * Domain-level AEO check: does the site's robots.txt block AI crawlers
 * (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.)? Wraps
 * `crawlerAccessRule` with a built-in fetcher.
 *
 * Calls this once per domain near the start of an audit alongside
 * `check_domain_llms_txt`. Sites that disallow GPTBot in robots.txt are
 * uncitable in ChatGPT regardless of how good their content is.
 */
export const checkDomainCrawlerAccessTool = defineTool({
  name: "check_domain_crawler_access",
  description:
    "Check whether the site's /robots.txt blocks AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc.). Call once per domain. Sites that disallow these user agents are uncitable in the corresponding AI engine, regardless of content quality. Returns `robotsTxtPresent: false` when the file is absent.",
  inputSchema,
  outputSchema,
  async execute({ origin, timeoutMs = 10_000 }, ctx) {
    const robotsUrl = `${new URL(origin).origin}/robots.txt`;
    const validateHop = async (hopUrl: string): Promise<void> => {
      let host: string;
      try {
        host = new URL(hopUrl).hostname;
      } catch {
        throw new Error(`check_domain_crawler_access: invalid URL ${hopUrl}`);
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
      // robots.txt absent or unreachable; rule will return [] for no content.
    }

    const findings = crawlerAccessRule(robotsTxtContent);

    return {
      origin: new URL(origin).origin,
      robotsTxtUrl: robotsUrl,
      robotsTxtPresent,
      findings: findings.map((f) => ({
        ruleId: "aeo/crawler-access" as const,
        severity: f.severity,
        message: f.message,
        fix: f.fix,
      })),
    };
  },
});
