import type { ParsedPage, RuleResult } from "../../types.js";

export function linkDepthRule(
  pages: ParsedPage[],
  adjacency: Map<string, Set<string>>,
  rootUrl: string,
  maxDepth: number,
  inbound: Map<string, number>
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

  const unreachable = pages
    .filter((page) => page.url !== rootUrl)
    .filter((page) => (inbound.get(page.url) ?? 0) > 0)
    .filter((page) => visited.get(page.url) === undefined)
    .map((page) => ({
      ruleId: "links/unreachable-from-root" as const,
      severity: "warning" as const,
      message: `${page.url} is not reachable from the crawl root via internal links (but has inbound links).`,
      pageUrl: page.url
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
      pageUrl: page.url
    }));

  return [...unreachable, ...deep];
}
