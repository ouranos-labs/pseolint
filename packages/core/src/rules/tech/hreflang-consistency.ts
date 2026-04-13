import type { NormalizeUrlOptions, ParsedPage, RuleResult } from "../../types.js";
import { normalizeAuditUrl } from "../../url-normalize.js";

export function hreflangConsistencyRule(
  pages: ParsedPage[],
  normalizeOpts: NormalizeUrlOptions
): RuleResult[] {
  const findings: RuleResult[] = [];

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

      normalizeAuditUrl(entry.href, normalizeOpts);
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

  return findings;
}
