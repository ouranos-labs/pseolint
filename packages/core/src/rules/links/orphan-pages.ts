import type { ParsedPage, RuleResult } from "../../types.js";

export function orphanPagesRule(
  pages: ParsedPage[],
  inboundLinks: Map<string, number>,
  rootUrl?: string,
  /**
   * 2026-06-16 calibration FP fix: on a sampled crawl the page that links to a
   * given URL is often simply not in the fetched subset, so "0 inbound in this
   * crawl" is not evidence of a real orphan. Orphan detection is only reliable
   * on a full crawl: skip it when sampled rather than flag healthy pages.
   */
  sampled = false
): RuleResult[] {
  if (sampled) return [];

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
