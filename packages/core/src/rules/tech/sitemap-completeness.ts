import type { ParsedPage, RuleResult } from "../../types.js";

export function sitemapCompletenessRule(
  pages: ParsedPage[],
  sitemapUrls: Set<string>
): RuleResult[] {
  if (sitemapUrls.size === 0) return [];

  const findings: RuleResult[] = [];

  const missingFromSitemap = pages.filter((p) => !sitemapUrls.has(p.url));
  if (missingFromSitemap.length > 0) {
    findings.push({
      ruleId: "tech/sitemap-completeness",
      severity: "error",
      message: `${missingFromSitemap.length} crawlable page(s) not in sitemap.`,
      fix: "Add these pages to your sitemap.xml to ensure Google discovers them.",
      relatedUrls: missingFromSitemap.map((p) => p.url).sort()
    });
  }

  for (const page of pages) {
    if (!page.httpMeta || !sitemapUrls.has(page.url)) continue;

    if (page.httpMeta.statusCode >= 400) {
      findings.push({
        ruleId: "tech/sitemap-completeness",
        severity: "error",
        message: `Sitemap URL ${page.url} returns HTTP ${page.httpMeta.statusCode}.`,
        pageUrl: page.url,
        fix: "Remove this URL from sitemap.xml or fix the page to return HTTP 200."
      });
    }

    if (page.httpMeta.redirectChain.length > 0 && page.httpMeta.finalUrl !== page.url) {
      findings.push({
        ruleId: "tech/sitemap-completeness",
        severity: "warning",
        message: `Sitemap URL ${page.url} redirects to ${page.httpMeta.finalUrl}.`,
        pageUrl: page.url,
        relatedUrls: [page.httpMeta.finalUrl],
        fix: `Update sitemap.xml to use the final URL: ${page.httpMeta.finalUrl}`
      });
    }
  }

  return findings;
}
