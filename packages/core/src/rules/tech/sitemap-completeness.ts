import { normalizeAuditUrl } from "../../url-normalize.js";
import type { NormalizeUrlOptions, ParsedPage, RuleResult } from "../../types.js";

export interface SitemapCompletenessOptions {
  /**
   * True when the audit ran on a sampled or link-discovery crawl.
   * On sampled crawls it is normal to find pages not listed in the sitemap
   * (they were discovered via links, not sitemap), so the aggregate
   * "missing from sitemap" finding is demoted to `warning`.
   * Wire this from the auditor's `isSampledAudit` flag.
   */
  sampled?: boolean;
  /** URL normalization options that match what the auditor used when building page.url. */
  normalizeUrlOptions?: NormalizeUrlOptions;
}

export function sitemapCompletenessRule(
  pages: ParsedPage[],
  sitemapUrls: Set<string>,
  options?: SitemapCompletenessOptions
): RuleResult[] {
  if (sitemapUrls.size === 0) return [];

  const { sampled = false, normalizeUrlOptions } = options ?? {};

  // Normalize sitemap URLs to match the already-normalized page.url values.
  // page.url is produced by normalizeAuditUrl (via parseHtmlPage → parser.ts),
  // so comparing raw sitemap XML URLs against it produces false positives for
  // trailing slashes, query strings, and hash fragments.
  const normalizedSitemapUrls = new Set(
    [...sitemapUrls].map((u) => normalizeAuditUrl(u, normalizeUrlOptions))
  );

  const findings: RuleResult[] = [];

  // "missing from sitemap"; demoted to `warning` because:
  //  • on a sampled crawl many pages were found via link discovery, not sitemap
  //  • even on a full crawl this is advisory (Google discovers via crawl too)
  // The genuine hard-error signal is the 4xx/5xx sub-check below.
  const missingFromSitemap = pages.filter((p) => !normalizedSitemapUrls.has(p.url));
  if (missingFromSitemap.length > 0) {
    findings.push({
      ruleId: "tech/sitemap-completeness",
      severity: "warning",
      message: `${missingFromSitemap.length} crawlable page(s) not in sitemap.`,
      fix: "Add these pages to your sitemap.xml to ensure Google discovers them.",
      relatedUrls: missingFromSitemap.map((p) => p.url).sort()
    });
  }

  for (const page of pages) {
    if (!page.httpMeta || !normalizedSitemapUrls.has(page.url)) continue;

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

  // NOTE: the noindex-in-sitemap sub-check below duplicates `robots-noindex-conflict`
  // and `canonical-noindex-conflict`. It is intentionally kept here because
  // sitemap-completeness is the only rule that sees the sitemap set directly and
  // can phrase the finding as "you're signalling two contradictory things to
  // Google via the sitemap". Removing it would lose the sitemap-specific framing.
  for (const page of pages) {
    if (!normalizedSitemapUrls.has(page.url)) continue;
    const hasNoindex =
      /noindex/i.test(page.robotsMeta) ||
      (page.httpMeta?.xRobotsTag != null && /noindex/i.test(page.httpMeta.xRobotsTag));
    if (hasNoindex) {
      findings.push({
        ruleId: "tech/sitemap-completeness",
        severity: "error",
        message: `${page.url} is in the sitemap but has a noindex directive.`,
        pageUrl: page.url,
        fix: "Remove the noindex directive or remove this URL from your sitemap.",
      });
    }
  }

  return findings;
}
