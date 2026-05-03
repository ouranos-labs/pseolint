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
          pageUrl: page.url,
          fix: `Remove the duplicate hreflang entry for ${entry.lang} on this page.`
        });
      }
      seen.add(lang);

      if (!entry.href) {
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${page.url} has hreflang ${entry.lang} without an href.`,
          pageUrl: page.url,
          fix: `Add a valid href to the hreflang ${entry.lang} entry on this page.`
        });
        continue;
      }

      if (!/^https?:\/\/[^\/]/i.test(entry.href)) {
        // Tightened the prefix check to require at least one host character
        // after `https://` — otherwise malformed hrefs like literal
        // "https://" pass the regex but crash normalizeAuditUrl downstream
        // (calibration round 2 surfaced this on webflow.com/templates).
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${page.url} has non-absolute or malformed hreflang href (${entry.href}) for ${entry.lang}.`,
          pageUrl: page.url,
          fix: `Change the hreflang href for ${entry.lang} to an absolute URL (starting with https:// and including a host).`
        });
        continue;
      }

      let normalizedHref: string;
      try {
        normalizedHref = normalizeAuditUrl(entry.href, normalizeOpts);
      } catch {
        // Defensive: any URL-parse failure here is unreachable given the
        // tightened regex above, but emit an honest finding rather than
        // letting an exception propagate and abort the entire audit.
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${page.url} has unparseable hreflang href (${entry.href}) for ${entry.lang}.`,
          pageUrl: page.url,
          fix: `Fix the hreflang href for ${entry.lang}; it could not be parsed as a URL.`,
        });
        continue;
      }
      const pageRefs = hreflangMap.get(page.url) ?? new Map<string, string>();
      pageRefs.set(lang, normalizedHref);
      hreflangMap.set(page.url, pageRefs);
    }

    if (!hasXDefault) {
      findings.push({
        ruleId: "tech/hreflang-consistency",
        severity: "info",
        message: `${page.url} has hreflang annotations but no x-default entry.`,
        pageUrl: page.url,
        fix: `Add <link rel="alternate" hreflang="x-default" href="..."> to specify a fallback URL for unmatched locales.`
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
        // 2026-05-03 calibration finding: on a sampled crawl we only audit a
        // subset of pages. If the hreflang target isn't in our sample, we
        // simply have no data on its annotations — flagging it as "no
        // hreflang back" is a false positive that scales with sample size
        // (~385 fires on a 25-page Wise sample). Only assert reciprocity on
        // pages we actually parsed.
        const wasParsed = pages.some((p) => p.url === targetUrl);
        if (!wasParsed) continue;
        findings.push({
          ruleId: "tech/hreflang-consistency",
          severity: "warning",
          message: `${pageUrl} declares hreflang ${lang} pointing to ${targetUrl}, but that page has no hreflang annotations back.`,
          pageUrl,
          relatedUrls: [targetUrl],
          fix: `Add a reciprocal hreflang annotation on ${targetUrl} pointing back to ${pageUrl}.`
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
          relatedUrls: [targetUrl],
          fix: `Add a reciprocal hreflang annotation on ${targetUrl} pointing back to ${pageUrl}.`
        });
      }
    }
  }

  return findings;
}
