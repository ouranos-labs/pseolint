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

  // links
  "links/orphan-pages": "corpus",
  "links/dead-ends": "corpus",
  "links/cluster-connectivity": "corpus",
  "links/link-depth": "corpus",
  "links/unreachable-from-root": "corpus",

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
