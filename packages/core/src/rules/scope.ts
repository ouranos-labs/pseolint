/**
 * Declarative scope for each rule ID.
 * - "page": output depends only on a single parsed page.
 * - "corpus": output requires the full set of pages (clustering, cross-page comparisons).
 *
 * Diff-audit dispatch reads this map and skips corpus rules when `state.since` is set.
 */
export type RuleScope = "page" | "corpus";

export const RULE_SCOPE: Record<string, RuleScope> = {
  // spam
  "spam/near-duplicate": "corpus",
  "spam/entity-swap": "corpus",
  "spam/thin-content": "page",
  "spam/boilerplate-ratio": "corpus",
  "spam/template-diversity": "corpus",
  "spam/publication-velocity": "corpus",
  "spam/doorway-pattern": "corpus",
  "spam/template-coverage": "corpus",

  // content
  "content/unique-value": "corpus",
  "content/meta-uniqueness": "corpus",
  "content/missing-author": "page",
  "content/eeat-signals": "page",
  "content/title-uniqueness": "corpus",
  "content/heading-structure": "page",
  "content/image-alt-text": "page",
  "content/citation-coverage": "page",
  "content/meta-description-presence": "page",

  // links
  "links/crawlable-anchors": "page",
  "links/generic-anchor-text": "page",
  "links/orphan-pages": "corpus",
  "links/dead-ends": "corpus",
  "links/cluster-connectivity": "corpus",
  "links/link-depth": "corpus",
  "links/unreachable-from-root": "corpus",
  "links/host-section-divergence": "corpus",

  // tech
  "tech/canonical-consistency": "corpus",
  "tech/canonical-noindex-conflict": "page",
  "tech/robots-noindex-conflict": "corpus",
  "tech/sitemap-completeness": "corpus",
  "tech/redirect-chain": "page",
  "tech/soft-404": "page",
  "tech/hreflang-consistency": "corpus",
  "tech/robots-compliance": "corpus",
  "tech/robots-sitemap-presence": "corpus",
  "tech/og-completeness": "page",
  "tech/csr-bailout": "page",
  "tech/core-web-vitals": "page",
  // 2026-08-19 folklore-vs-fact batch (see docs/folklore.md)
  "tech/language-mismatch": "page",
  "tech/hreflang-validity": "page",
  "tech/html-size": "page",
  "tech/meta-robots-conflict": "page",
  "tech/snippet-suppression": "page",
  "tech/viewport-meta": "page",
  "tech/sitemap-hygiene": "corpus",
  "tech/robots-txt-limits": "corpus",

  // schema
  "schema/json-ld-valid": "page",
  "schema/required-fields": "page",
  "schema/consistency": "corpus",

  // cannibal — only url-pattern survives in v0.4 (title-overlap and
  // keyword-collision dropped due to high false-positive rates; see
  // 2026-04-29 v0.4 redesign spec §4.3).
  "cannibal/url-pattern": "corpus",

  // data binding
  "data/missing-binding": "page",
  "data/identical-across-pages": "corpus",

  // audit-internal
  "audit/duplicate-url": "corpus",

  // AEO (Answer Engine Optimization).
  "aeo/llms-txt": "corpus",
  "aeo/crawler-access": "corpus",
  "aeo/freshness-signals": "page",
  "aeo/faq-coverage": "page",
  "aeo/answer-first": "page",
  "aeo/citable-facts": "page",
  "aeo/content-modularity": "page",
  "aeo/summary-bait": "page",
};

/** Returns true when the rule may run in diff (page-scoped) mode. Unknown ids default to corpus (safer). */
export function isRuleAllowedInDiff(ruleId: string): boolean {
  return (RULE_SCOPE[ruleId] ?? "corpus") === "page";
}

/**
 * Canonical count of user-facing **scored** rules — every rule in `RULE_SCOPE`
 * except internal `audit/*` diagnostics (which never enter the scored category
 * buckets; see `auditor.ts` CATEGORY_MAP `audit: "audit"` with weight 0).
 * Derived from the registry so the public "N rules" copy can't drift.
 */
export const SCORED_RULE_COUNT: number = Object.keys(RULE_SCOPE).filter(
  (id) => !id.startsWith("audit/"),
).length;
