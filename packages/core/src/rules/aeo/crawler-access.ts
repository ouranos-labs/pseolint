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

/**
 * Parse robots.txt into a map of user-agent -> list of Allow patterns.
 * Mirrors parseRobotsByUserAgent but captures Allow directives.
 */
export function parseRobotsAllowByUserAgent(robotsTxt: string): Map<string, string[]> {
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

    if (/^allow\s*:/i.test(line)) {
      const value = line.replace(/^allow\s*:\s*/i, "").trim();
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

/**
 * RFC 9309 block status for an agent given its disallow and allow patterns.
 * Returns:
 *   "none"    — not blocked (no root disallow, or root disallow overridden by Allow: /)
 *   "partial" — root disallow with some Allow paths that reopen part of the site (but not all)
 *   "full"    — root disallow with no overriding Allow
 */
export function blockStatus(
  disallowPatterns: string[] | undefined,
  allowPatterns: string[] | undefined,
): "none" | "partial" | "full" {
  if (!isFullyDisallowed(disallowPatterns)) return "none";

  const allows = allowPatterns ?? [];

  // Allow: / (or Allow: /*) reopens everything — not blocked at all.
  if (allows.some((p) => p === "/" || p === "/*")) return "none";

  // Any Allow directive at all means partial access remains.
  if (allows.length > 0) return "partial";

  return "full";
}

export interface CrawlerAccessOptions {
  /** List of AI crawler user-agents to check. */
  crawlers?: readonly string[];
}

/**
 * Warn per blocked AI crawler; escalate to error when all configured crawlers are blocked.
 * Wildcard blocks (`User-agent: *` + `Disallow: /`) also count as blocking each named crawler
 * unless the crawler has its own more-permissive block.
 * Per RFC 9309, Allow directives override Disallow when more specific (or equal length).
 */
export function crawlerAccessRule(
  robotsTxtContent: string,
  options?: CrawlerAccessOptions,
): RuleResult[] {
  if (!robotsTxtContent) return [];

  const crawlers = options?.crawlers ?? DEFAULT_AI_CRAWLERS;
  const byAgentDisallow = parseRobotsByUserAgent(robotsTxtContent);
  const byAgentAllow = parseRobotsAllowByUserAgent(robotsTxtContent);

  const wildcardStatus = blockStatus(byAgentDisallow.get("*"), byAgentAllow.get("*"));

  // Categorize each crawler as "full", "partial", or "none".
  const fullyBlocked: string[] = [];
  const partiallyBlocked: string[] = [];

  for (const crawler of crawlers) {
    const key = crawler.toLowerCase();
    const hasOwnGroup = byAgentDisallow.has(key) || byAgentAllow.has(key);

    if (!hasOwnGroup) {
      // No explicit group — inherit the wildcard status.
      if (wildcardStatus === "full") fullyBlocked.push(crawler);
      else if (wildcardStatus === "partial") partiallyBlocked.push(crawler);
      continue;
    }

    const status = blockStatus(byAgentDisallow.get(key), byAgentAllow.get(key));
    if (status === "full") fullyBlocked.push(crawler);
    else if (status === "partial") partiallyBlocked.push(crawler);
  }

  if (fullyBlocked.length === 0 && partiallyBlocked.length === 0) return [];

  const findings: RuleResult[] = [];
  const allFullyBlocked =
    fullyBlocked.length === crawlers.length && partiallyBlocked.length === 0;

  if (allFullyBlocked) {
    findings.push({
      ruleId: "aeo/crawler-access",
      severity: "error",
      // High: blocking ALL crawlers is either deliberate (clear intent) or a clear
      // mistake — either way the finding is unambiguous.
      confidence: "high",
      message: `robots.txt blocks all ${crawlers.length} configured AI crawlers: ${fullyBlocked.join(", ")}.`,
      fix:
        `Blocking every AI crawler makes your pages invisible to answer engines. ` +
        `Sites uncited in AI Overviews lose ~68% of traffic vs ~12% for cited sites. ` +
        `Remove the Disallow rules for these crawlers unless you have a specific legal or competitive reason to block them.`,
    });
    return findings;
  }

  for (const crawler of fullyBlocked) {
    findings.push({
      ruleId: "aeo/crawler-access",
      severity: "warning",
      // Medium: partial blocks are often deliberate (e.g. blocking Bytespider for
      // policy reasons while leaving GPTBot allowed).
      confidence: "medium",
      message: `robots.txt blocks ${crawler}.`,
      fix:
        `Remove the "Disallow: /" directive for User-agent: ${crawler} in your robots.txt. ` +
        `Blocking ${crawler} removes your pages from its answer engine's citation pool. ` +
        `If selective blocking is intentional (e.g. admin routes only), narrow the Disallow pattern instead of blocking the whole site.`,
    });
  }

  for (const crawler of partiallyBlocked) {
    findings.push({
      ruleId: "aeo/crawler-access",
      severity: "warning",
      confidence: "medium",
      message: `robots.txt partially blocks ${crawler} (Disallow: / with Allow override).`,
      fix:
        `Your robots.txt has "Disallow: /" for ${crawler} with some Allow paths that reopen specific routes. ` +
        `While this is a partial block, crawlers may still miss large parts of your site. ` +
        `Consider narrowing the Disallow directive to only the paths you actually want to restrict.`,
    });
  }

  return findings;
}
