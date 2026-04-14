import { dirname, resolve } from "node:path";
import type { NormalizeUrlOptions, ParsedPage, RuleResult } from "../../types.js";
import { normalizeAuditUrl } from "../../url-normalize.js";

export function resolveCanonicalUrl(
  canonical: string,
  pageUrl: string,
  normalizeOpts: NormalizeUrlOptions
): string | null {
  const raw = canonical.trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) return normalizeAuditUrl(raw, normalizeOpts);

  if (/^https?:\/\//i.test(pageUrl)) {
    try {
      return normalizeAuditUrl(new URL(raw, pageUrl).href, normalizeOpts);
    } catch {
      return null;
    }
  }

  return normalizeAuditUrl(resolve(dirname(pageUrl), raw), normalizeOpts);
}

export function canonicalConsistencyRule(
  pages: ParsedPage[],
  knownUrls: Set<string>,
  normalizeOpts: NormalizeUrlOptions
): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    if (!page.canonical) {
      findings.push({
        ruleId: "tech/canonical-consistency",
        severity: "error",
        message: `${page.url} is missing a canonical URL.`,
        pageUrl: page.url,
        fix: `Add <link rel="canonical" href="${page.url}" /> to the <head>.`
      });
      continue;
    }

    const canonicalUrl = resolveCanonicalUrl(page.canonical, page.url, normalizeOpts);
    if (!canonicalUrl) {
      findings.push({
        ruleId: "tech/canonical-consistency",
        severity: "error",
        message: `${page.url} has an invalid canonical URL: ${page.canonical}.`,
        pageUrl: page.url,
        fix: "Fix the canonical URL syntax."
      });
      continue;
    }

    if (canonicalUrl === page.url) continue;

    findings.push({
      ruleId: "tech/canonical-consistency",
      severity: knownUrls.has(canonicalUrl) ? "warning" : "info",
      message: knownUrls.has(canonicalUrl)
        ? `${page.url} canonicalizes to another crawled page (${canonicalUrl}).`
        : `${page.url} canonicalizes outside the crawl scope (${canonicalUrl}).`,
      pageUrl: page.url,
      relatedUrls: [canonicalUrl],
      fix: "Verify this canonical target is intentional."
    });

    // Check HTTP Link header for canonical
    if (page.httpMeta?.linkHeader) {
      const linkCanonicalMatch = page.httpMeta.linkHeader.match(/<([^>]+)>;\s*rel="canonical"/i);
      if (linkCanonicalMatch) {
        const httpCanonical = normalizeAuditUrl(linkCanonicalMatch[1], normalizeOpts);
        const htmlCanonical = page.canonical
          ? resolveCanonicalUrl(page.canonical, page.url, normalizeOpts)
          : null;
        if (httpCanonical && htmlCanonical && httpCanonical !== htmlCanonical) {
          findings.push({
            ruleId: "tech/canonical-consistency",
            severity: "error",
            message: `${page.url} has conflicting canonical URLs: HTML says ${htmlCanonical}, HTTP Link header says ${httpCanonical}.`,
            pageUrl: page.url,
            relatedUrls: [htmlCanonical, httpCanonical],
            fix: "Ensure the HTML <link rel='canonical'> and HTTP Link header agree on the canonical URL."
          });
        }
      }
    }
  }

  return findings;
}
