import type { NormalizeUrlOptions, ParsedPage, RuleResult } from "../../types.js";
import { resolveCanonicalUrl } from "./canonical-consistency.js";

export function canonicalNoindexConflictRule(
  pages: ParsedPage[],
  normalizeOpts: NormalizeUrlOptions
): RuleResult[] {
  const findings: RuleResult[] = [];

  for (const page of pages) {
    const robots = page.robotsMeta.toLowerCase();
    if (!robots.includes("noindex") || !page.canonical) {
      continue;
    }

    const canonicalUrl = resolveCanonicalUrl(page.canonical, page.url, normalizeOpts);
    if (!canonicalUrl) {
      continue;
    }
    if (canonicalUrl === page.url) {
      continue;
    }

    findings.push({
      ruleId: "tech/canonical-noindex-conflict",
      severity: "warning",
      message: `${page.url} is noindex but canonicalizes to ${canonicalUrl}.`,
      pageUrl: page.url,
      relatedUrls: [canonicalUrl],
      fix: "Remove the noindex directive or change the canonical to self-reference."
    });
  }

  return findings;
}
