import type { ParsedPage, RuleResult } from "../../types.js";

export function linkDepthRule(
  pages: ParsedPage[],
  adjacency: Map<string, Set<string>>,
  rootUrl: string,
  maxDepth: number,
  inbound: Map<string, number>,
  /**
   * 2026-05-03 calibration credibility fix: when we only audited a sampled
   * subset of the site (e.g. 50 of 269 Zapier pages), the link graph we
   * built reflects the sample, not the real site. Pages flagged
   * "unreachable from root" might just be sampling artifacts: the
   * real path back to the root exists, we just didn't fetch the
   * intermediary pages. Pass `sampled: true` to skip the unreachable-
   * from-root check; depth-from-root keeps working since the BFS still
   * runs on whatever subgraph we have.
   */
  sampled = false,
): RuleResult[] {
  const queue: Array<{ url: string; depth: number }> = [{ url: rootUrl, depth: 0 }];
  const visited = new Map<string, number>([[rootUrl, 0]]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const neighbors = adjacency.get(current.url) ?? new Set<string>();
    for (const next of neighbors) {
      const existing = visited.get(next);
      const candidate = current.depth + 1;
      if (existing !== undefined && existing <= candidate) {
        continue;
      }
      visited.set(next, candidate);
      queue.push({ url: next, depth: candidate });
    }
  }

  const unreachable = sampled
    ? []
    : pages
        .filter((page) => page.url !== rootUrl)
        .filter((page) => (inbound.get(page.url) ?? 0) > 0)
        .filter((page) => visited.get(page.url) === undefined)
        .map((page) => ({
          ruleId: "links/unreachable-from-root" as const,
          severity: "warning" as const,
          message: `${page.url} is not reachable from the crawl root via internal links (but has inbound links).`,
          pageUrl: page.url,
          fix: "This page is unreachable from the site root. Add a navigation path to it."
        }));

  const deep = pages
    .filter((page) => page.url !== rootUrl)
    .filter((page) => {
      const d = visited.get(page.url);
      return d !== undefined && d > maxDepth;
    })
    .map((page) => ({
      ruleId: "links/link-depth",
      severity: "info" as const,
      message: `${page.url} is deeper than ${maxDepth} clicks from root.`,
      pageUrl: page.url,
      fix: "Reduce click depth by linking from a higher-level page."
    }));

  return [...unreachable, ...deep];
}
