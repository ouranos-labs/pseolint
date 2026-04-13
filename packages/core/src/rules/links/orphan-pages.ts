import type { ParsedPage, RuleResult } from "../../types.js";

export function orphanPagesRule(
  pages: ParsedPage[],
  inboundLinks: Map<string, number>,
  rootUrl?: string
): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (rootUrl && page.url === rootUrl) {
      continue;
    }
    if ((inboundLinks.get(page.url) ?? 0) === 0) {
      findings.push({
        ruleId: "links/orphan-pages",
        severity: "error",
        message: `${page.url} has no inbound links from other pages in this crawl.`,
        pageUrl: page.url,
        fix: "Link to this page from a relevant hub or index page, and include it in your site navigation."
      });
    }
  }

  return findings;
}
