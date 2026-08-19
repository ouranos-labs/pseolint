import type { ParsedPage, RuleResult } from "../../types.js";

/**
 * content/meta-description-presence — flags pages that ship no meta description
 * at all. Without one, Google composes the SERP snippet itself from arbitrary
 * on-page text, so the site loses control over its own click-through pitch.
 *
 * NOTE: we deliberately do NOT lint description length. Google documents no
 * character limit for meta descriptions — truncation is a device-width display
 * behavior, not a quality signal
 * (https://developers.google.com/search/docs/appearance/snippet) — so any
 * "keep it under N characters" check would be folklore, not policy.
 *
 * Distinct from content/meta-uniqueness, which flags DUPLICATE descriptions
 * across pages; this rule only checks presence on each page.
 */
export function metaDescriptionPresenceRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];
  for (const page of pages) {
    if (!page.html) continue;
    if (page.metaDescription.trim()) continue;

    findings.push({
      ruleId: "content/meta-description-presence",
      severity: "warning",
      confidence: "high",
      message: `${page.url} has no meta description — Google will compose the snippet itself from page text, so you lose control over the SERP pitch and likely CTR.`,
      pageUrl: page.url,
      fix: 'Add <meta name="description" content="..."> to <head> with a summary written for THIS page (not a site-wide boilerplate line).',
    });
  }
  return findings;
}
