import type { ParsedPage, RuleResult } from "../../types.js";

export function deadEndsRule(
  pages: ParsedPage[],
  knownUrls: Set<string>,
  rootUrl?: string
): RuleResult[] {
  return pages
    .filter((page) => !rootUrl || page.url !== rootUrl)
    .filter(
      (page) =>
        page.resolvedHrefs.filter((link) => knownUrls.has(link) && link !== page.url).length === 0
    )
    .map((page) => ({
      ruleId: "links/dead-ends",
      severity: "warning" as const,
      message: `${page.url} has no outbound links to other pages in this crawl.`,
      pageUrl: page.url
    }));
}
