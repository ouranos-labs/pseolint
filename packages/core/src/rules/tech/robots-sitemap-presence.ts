import type { ParsedPage, RuleResult } from "../../types.js";

async function fetchTextIfOk(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  }
}

export async function robotsSitemapPresenceRule(source: string): Promise<RuleResult[]> {
  if (!/^https?:\/\//i.test(source)) {
    return [];
  }

  const sourceUrl = new URL(source);
  const origin = sourceUrl.origin;
  const robotsUrl = `${origin}/robots.txt`;
  const sitemapUrl = `${origin}/sitemap.xml`;
  const findings: RuleResult[] = [];

  const robotsText = await fetchTextIfOk(robotsUrl);
  if (!robotsText) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "warning",
      message: `Could not fetch ${robotsUrl}.`,
      fix: `Create a robots.txt file at ${robotsUrl} and include a Sitemap directive pointing to your sitemap.`
    });
    return findings;
  }

  if (!/^\s*sitemap\s*:/gim.test(robotsText)) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "info",
      message: `${robotsUrl} does not declare a Sitemap directive.`,
      fix: `Add a Sitemap directive to ${robotsUrl}, e.g.: Sitemap: ${sitemapUrl}`
    });
  }

  const sitemapText = await fetchTextIfOk(sitemapUrl);
  if (!sitemapText) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "warning",
      message: `Could not fetch ${sitemapUrl}.`,
      fix: `Create an XML sitemap at ${sitemapUrl} and reference it in ${robotsUrl}.`
    });
    return findings;
  }

  const lowered = sitemapText.toLowerCase();
  if (!lowered.includes("<urlset") && !lowered.includes("<sitemapindex")) {
    findings.push({
      ruleId: "tech/robots-sitemap-presence",
      severity: "warning",
      message: `${sitemapUrl} was fetched but does not look like sitemap XML.`,
      fix: `Ensure ${sitemapUrl} is valid sitemap XML containing a <urlset> or <sitemapindex> root element.`
    });
  }

  return findings;
}

/**
 * Parses Disallow directives from the `User-agent: *` block of a robots.txt string.
 * Returns an array of raw pattern strings (e.g. "/secret", "/templates/", "/*.json").
 */
/** Parse `Crawl-delay: N` from the `User-agent: *` block. Returns seconds, or 0 if unset. */
export function parseCrawlDelaySeconds(robotsTxt: string): number {
  const lines = robotsTxt.split(/\r?\n/);
  let inWildcardBlock = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (/^user-agent\s*:/i.test(line)) {
      const value = line.replace(/^user-agent\s*:\s*/i, "").trim();
      inWildcardBlock = value === "*";
      continue;
    }
    if (!inWildcardBlock) continue;
    if (/^crawl-delay\s*:/i.test(line)) {
      const value = line.replace(/^crawl-delay\s*:\s*/i, "").trim();
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return Math.min(n, 60);
    }
  }
  return 0;
}

/**
 * Parse Disallow patterns for the given user-agents. Merges the `User-agent: *`
 * block with any named UA blocks; a hostile site that specifically disallows
 * `pseolint` without a wildcard still gets honored.
 *
 * The default UA list (`["*"]`) preserves the pre-v0.3.2 behavior for callers
 * that don't opt into UA-specific matching.
 */
export function parseDisallowPatterns(robotsTxt: string, userAgents: readonly string[] = ["*"]): string[] {
  const lines = robotsTxt.split(/\r?\n/);
  const patterns: string[] = [];
  const uaSet = new Set(userAgents.map((u) => u.toLowerCase()));
  let inMatchingBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Skip comments and blank lines
    if (!line || line.startsWith("#")) continue;

    // Detect User-agent directive
    if (/^user-agent\s*:/i.test(line)) {
      const value = line.replace(/^user-agent\s*:\s*/i, "").trim().toLowerCase();
      inMatchingBlock = uaSet.has(value);
      continue;
    }

    if (!inMatchingBlock) continue;

    if (/^disallow\s*:/i.test(line)) {
      const value = line.replace(/^disallow\s*:\s*/i, "").trim();
      // Empty Disallow means "allow everything" — skip
      if (value) {
        patterns.push(value);
      }
    }
  }

  return patterns;
}

/**
 * Returns true if `urlPath` (e.g. "/blog/post") is blocked by a single Disallow pattern.
 *
 * Rules:
 *  - Trailing slash: "/foo/" blocks any path starting with "/foo/"
 *  - Wildcard `*`: iterative segment matching (no dynamic RegExp — avoids ReDoS)
 *  - Exact match otherwise
 */
export function isBlockedByPattern(urlPath: string, pattern: string): boolean {
  if (!pattern) return false;

  if (pattern.includes("*")) {
    // Iterative wildcard match: split pattern on `*` and verify each literal
    // segment appears in order within urlPath.
    const parts = pattern.split("*");
    let pos = 0;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      if (i === 0) {
        // First segment must match at the start (robots patterns are prefix-anchored)
        if (!urlPath.startsWith(part)) return false;
        pos = part.length;
      } else {
        const idx = urlPath.indexOf(part, pos);
        if (idx === -1) return false;
        pos = idx + part.length;
      }
    }
    return true;
  }

  // Trailing slash: prefix match
  if (pattern.endsWith("/")) {
    return urlPath.startsWith(pattern);
  }

  // Exact match
  return urlPath === pattern;
}

export function robotsComplianceRule(
  pages: ParsedPage[],
  sitemapUrls: Set<string>,
  robotsTxtContent: string,
): RuleResult[] {
  const disallowPatterns = parseDisallowPatterns(robotsTxtContent);
  if (disallowPatterns.length === 0) return [];

  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!sitemapUrls.has(page.url)) continue;

    let parsedPath: string;
    try {
      parsedPath = new URL(page.url).pathname;
    } catch {
      continue;
    }

    for (const pattern of disallowPatterns) {
      if (isBlockedByPattern(parsedPath, pattern)) {
        findings.push({
          ruleId: "tech/robots-compliance",
          severity: "error",
          message: `${page.url} is in the sitemap but blocked by robots.txt (Disallow: ${pattern}).`,
          pageUrl: page.url,
          fix: "Remove the Disallow directive or remove this URL from your sitemap.",
        });
        break; // one finding per page is enough
      }
    }
  }

  return findings;
}
