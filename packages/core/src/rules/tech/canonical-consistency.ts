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
        pageUrl: page.url
      });
      continue;
    }

    const canonicalUrl = resolveCanonicalUrl(page.canonical, page.url, normalizeOpts);
    if (!canonicalUrl) {
      findings.push({
        ruleId: "tech/canonical-consistency",
        severity: "error",
        message: `${page.url} has an invalid canonical URL: ${page.canonical}.`,
        pageUrl: page.url
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
      relatedUrls: [canonicalUrl]
    });
  }

  return findings;
}
