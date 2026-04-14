import type { ParsedPage, RuleResult } from "../../types.js";

export function redirectChainRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.httpMeta) continue;
    const hops = page.httpMeta.redirectChain.length;
    if (hops <= 2) continue;

    findings.push({
      ruleId: "tech/redirect-chain",
      severity: "warning",
      message: `${page.url} has a ${hops}-hop redirect chain before reaching ${page.httpMeta.finalUrl}.`,
      pageUrl: page.url,
      relatedUrls: [...page.httpMeta.redirectChain, page.httpMeta.finalUrl],
      fix: `Reduce the redirect chain to a single hop. Update internal links and sitemap to point to ${page.httpMeta.finalUrl}.`
    });
  }

  return findings;
}
