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
  "content/heading-uniqueness": "corpus",
  "content/meta-uniqueness": "corpus",
  "content/missing-author": "page",
  "content/eeat-signals": "page",

  // links (all need the global link graph)
  "links/orphan-pages": "corpus",
  "links/dead-ends": "corpus",
  "links/cluster-connectivity": "corpus",
  "links/hub-pages": "corpus",
  "links/link-depth": "corpus",
  "links/unreachable-from-root": "corpus",
  "links/hub-pages-skipped": "corpus",

  // tech (per-page except sitemap / robots / canonical-consistency which need knownUrls)
  "tech/canonical-consistency": "corpus",
  "tech/canonical-noindex-conflict": "page",
  "tech/robots-noindex-conflict": "corpus",
  "tech/sitemap-completeness": "corpus",
  "tech/redirect-chain": "page",
  "tech/soft-404": "page",
  "tech/og-completeness": "page",
  "tech/hreflang-consistency": "corpus",
  "tech/robots-compliance": "corpus",
  "tech/robots-sitemap-presence": "corpus",

  // schema
  "schema/json-ld-valid": "page",
  "schema/required-fields": "page",
  "schema/consistency": "corpus",

  // cannibal (cross-page by definition)
  "cannibal/title-overlap": "corpus",
  "cannibal/keyword-collision": "corpus",
  "cannibal/url-pattern": "corpus",

  // data binding
  "data/missing-binding": "page",
  "data/identical-across-pages": "corpus",

  // audit-internal
  "audit/duplicate-url": "corpus",

  // AEO (Answer Engine Optimization) — forward-compatible entries for rules
  // shipping from a parallel core-engine change. `llms-txt` and `crawler-access`
  // are site-wide (need host config / robots surface); the rest evaluate a
  // single page's content structure and must run in daily diff-audits.
  "aeo/llms-txt": "corpus",
  "aeo/crawler-access": "corpus",
  "aeo/freshness-signals": "page",
  "aeo/faq-coverage": "page",
  "aeo/answer-first": "page",
  "aeo/citable-facts": "page",
  "aeo/non-replicable-value": "page",
  "aeo/content-modularity": "page",
};

/** Returns true when the rule may run in diff (page-scoped) mode. Unknown ids default to corpus (safer). */
export function isRuleAllowedInDiff(ruleId: string): boolean {
  return (RULE_SCOPE[ruleId] ?? "corpus") === "page";
}
