import type { NormalizeUrlOptions, ParsedPage, RuleResult } from "../../types.js";
import { normalizeAuditUrl } from "../../url-normalize.js";

export function hreflangConsistencyRule(
  pages: ParsedPage[],
  normalizeOpts: NormalizeUrlOptions
): RuleResult[] {
  const findings: RuleResult[] = [];

  const hreflangMap = new Map<string, Map<string, string>>();

  for (const page of pages) {
    if (page.hreflangs.length === 0) {
      continue;
    }

    const seen = new Set<string>();
    let hasXDefault = false;

    for (const entry of page.hreflangs) {
      const lang = entry.lang.toLowerCase();
      if (lang === "x-default") {
        hasXDefault = true;
      }
      if (seen.has(lang)) {
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${page.url} has duplicate hreflang entry for ${entry.lang}.`,
          pageUrl: page.url
        });
      }
      seen.add(lang);

      if (!entry.href) {
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${page.url} has hreflang ${entry.lang} without an href.`,
          pageUrl: page.url
        });
        continue;
      }

      if (!/^https?:\/\//i.test(entry.href)) {
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${page.url} has non-absolute hreflang href (${entry.href}) for ${entry.lang}.`,
          pageUrl: page.url
        });
        continue;
      }

      const normalizedHref = normalizeAuditUrl(entry.href, normalizeOpts);
      const pageRefs = hreflangMap.get(page.url) ?? new Map<string, string>();
      pageRefs.set(lang, normalizedHref);
      hreflangMap.set(page.url, pageRefs);
    }

    if (!hasXDefault) {
      findings.push({
        ruleId: "tech/hreflang-consistency",
        severity: "info",
        message: `${page.url} has hreflang annotations but no x-default entry.`,
        pageUrl: page.url
      });
    }
  }

  const checkedPairs = new Set<string>();
  for (const [pageUrl, refs] of hreflangMap) {
    for (const [lang, targetUrl] of refs) {
      if (lang === "x-default") continue;
      if (targetUrl === pageUrl) continue;

      const pairKey = [pageUrl, targetUrl].sort().join("||");
      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);

      const targetRefs = hreflangMap.get(targetUrl);
      if (!targetRefs) {
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${pageUrl} declares hreflang ${lang} pointing to ${targetUrl}, but that page has no hreflang annotations back.`,
          pageUrl,
          relatedUrls: [targetUrl]
        });
        continue;
      }

      const reciprocal = Array.from(targetRefs.values()).some((href) => href === pageUrl);
      if (!reciprocal) {
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${pageUrl} declares hreflang ${lang} to ${targetUrl}, but ${targetUrl} does not link back.`,
          pageUrl,
          relatedUrls: [targetUrl]
        });
      }
    }
  }

  return findings;
}
