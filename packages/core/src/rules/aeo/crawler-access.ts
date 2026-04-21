import type { RuleResult } from "../../types.js";

/**
 * Default AI crawler user-agents to check. Ordered by prevalence.
 */
export const DEFAULT_AI_CRAWLERS = [
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "PerplexityBot",
  "Bytespider",
  "Google-Extended",
  "CCBot",
  "Applebot-Extended",
] as const;

/**
 * Parse robots.txt into a map of user-agent -> list of Disallow patterns.
 * User-agent keys are lowercased for case-insensitive lookup.
 * A blank Disallow value is treated as "allow all" and produces an empty array
 * (matches the robots spec: "Disallow: " with no value means no restrictions).
 */
export function parseRobotsByUserAgent(robotsTxt: string): Map<string, string[]> {
  const lines = robotsTxt.split(/\r?\n/);
  const result = new Map<string, string[]>();
  let currentAgents: string[] = [];
  let expectingRules = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (/^user-agent\s*:/i.test(line)) {
      const ua = line.replace(/^user-agent\s*:\s*/i, "").trim().toLowerCase();
      if (!expectingRules) {
        // Stacking consecutive User-agent lines — they all share the next rule block.
        currentAgents.push(ua);
      } else {
        currentAgents = [ua];
        expectingRules = false;
      }
      if (!result.has(ua)) result.set(ua, []);
      continue;
    }

    if (/^(allow|disallow|crawl-delay|sitemap)\s*:/i.test(line)) {
      expectingRules = true;
    }

    if (/^disallow\s*:/i.test(line)) {
      const value = line.replace(/^disallow\s*:\s*/i, "").trim();
      if (!value) continue;
      for (const agent of currentAgents) {
        const bucket = result.get(agent);
        if (bucket) bucket.push(value);
      }
    }
  }

  return result;
}

/** True if the Disallow list includes a root block (`/`). */
export function isFullyDisallowed(patterns: string[] | undefined): boolean {
  if (!patterns) return false;
  return patterns.some((p) => p === "/" || p === "/*");
}

export interface CrawlerAccessOptions {
  /** List of AI crawler user-agents to check. */
  crawlers?: readonly string[];
}

/**
 * Warn per blocked AI crawler; escalate to error when all configured crawlers are blocked.
 * Wildcard blocks (`User-agent: *` + `Disallow: /`) also count as blocking each named crawler
 * unless the crawler has its own more-permissive block.
 */
export function crawlerAccessRule(
  robotsTxtContent: string,
  options?: CrawlerAccessOptions,
): RuleResult[] {
  if (!robotsTxtContent) return [];

  const crawlers = options?.crawlers ?? DEFAULT_AI_CRAWLERS;
  const byAgent = parseRobotsByUserAgent(robotsTxtContent);
  const wildcardBlocked = isFullyDisallowed(byAgent.get("*"));

  const blocked: string[] = [];
  for (const crawler of crawlers) {
    const key = crawler.toLowerCase();
    const ownBlock = byAgent.get(key);
    if (ownBlock === undefined) {
      // No explicit block for this agent — it falls back to the wildcard block.
      if (wildcardBlocked) blocked.push(crawler);
      continue;
    }
    if (isFullyDisallowed(ownBlock)) blocked.push(crawler);
  }

  if (blocked.length === 0) return [];

  const findings: RuleResult[] = [];
  const allBlocked = blocked.length === crawlers.length;

  if (allBlocked) {
    findings.push({
      ruleId: "aeo/crawler-access",
      severity: "error",
      message: `robots.txt blocks all ${crawlers.length} configured AI crawlers: ${blocked.join(", ")}.`,
      fix:
        `Blocking every AI crawler makes your pages invisible to answer engines. ` +
        `Sites uncited in AI Overviews lose ~68% of traffic vs ~12% for cited sites. ` +
        `Remove the Disallow rules for these crawlers unless you have a specific legal or competitive reason to block them.`,
    });
    return findings;
  }

  for (const crawler of blocked) {
    findings.push({
      ruleId: "aeo/crawler-access",
      severity: "warning",
      message: `robots.txt blocks ${crawler}.`,
      fix:
        `Remove the "Disallow: /" directive for User-agent: ${crawler} in your robots.txt. ` +
        `Blocking ${crawler} removes your pages from its answer engine's citation pool. ` +
        `If selective blocking is intentional (e.g. admin routes only), narrow the Disallow pattern instead of blocking the whole site.`,
    });
  }

  return findings;
}
