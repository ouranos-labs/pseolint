/**
 * Orchestrator tool registry. Each entry is a `DefinedTool` — call
 * `.toAiTool()` to get an AI-SDK-compatible tool object, or `.run()` for
 * direct unit-test invocation.
 *
 * Phase 1 covers the canonical tool patterns:
 *   - HTTP / sitemap I/O          (fetch_page, fetch_sitemap)
 *   - Page parsing                (parse_page)
 *   - Template clustering         (detect_templates, sample_template)
 *   - Per-page rule checks        (check_rule_*)
 *   - Cluster-aware rule checks   (check_rule_near_duplicate, check_rule_schema_consistency)
 *   - Multi-page AEO rule checks  (check_rule_faq_coverage, _citable_facts, etc.)
 *   - Domain-level checks         (check_domain_llms_txt, check_domain_crawler_access)
 *
 * Future phases extend this map with the remaining rule wrappers (links/*,
 * tech/redirect-chain, tech/soft-404, etc. — most useful as part of
 * `check_all_rules` once that escape hatch lands), schema/text validators,
 * and external probes (SerpAPI, ask_ai_engine).
 */
export { defineTool } from "./types.js";
export type { DefinedTool, ToolDefinition, ToolOk, ToolErr, ToolResult } from "./types.js";

// I/O + sampling
export { fetchPageTool } from "./fetch-page.js";
export { fetchSitemapTool } from "./fetch-sitemap.js";
export { parsePageTool } from "./parse-page.js";
export { detectTemplatesTool } from "./detect-templates.js";
export { sampleTemplateTool } from "./sample-template.js";

// Single-page rule checks
export { checkRuleThinContentTool } from "./check-rule-thin-content.js";
export { checkRuleMissingAuthorTool } from "./check-rule-missing-author.js";
export { checkRuleCanonicalConsistencyTool } from "./check-rule-canonical-consistency.js";
export { checkRuleJsonLdValidTool } from "./check-rule-json-ld-valid.js";
export { checkRuleAnswerFirstTool } from "./check-rule-answer-first.js";

// Cluster / multi-page rule checks
export { checkRuleNearDuplicateTool } from "./check-rule-near-duplicate.js";
export { checkRuleFaqCoverageTool } from "./check-rule-faq-coverage.js";
export { checkRuleCitableFactsTool } from "./check-rule-citable-facts.js";
export { checkRuleFreshnessSignalsTool } from "./check-rule-freshness-signals.js";
export { checkRuleContentModularityTool } from "./check-rule-content-modularity.js";
export { checkRuleSummaryBaitTool } from "./check-rule-summary-bait.js";
export { checkRuleRequiredFieldsTool } from "./check-rule-required-fields.js";
export { checkRuleSchemaConsistencyTool } from "./check-rule-schema-consistency.js";

// Domain-level checks
export { checkDomainLlmsTxtTool } from "./check-domain-llms-txt.js";
export { checkDomainCrawlerAccessTool } from "./check-domain-crawler-access.js";

// Utility checks
export { checkRobotsTool } from "./check-robots.js";
export { checkIndexabilityTool } from "./check-indexability.js";
export { validateJsonLdTool } from "./validate-jsonld.js";

// External probes
export { querySerpTool } from "./query-serp.js";
export { askAiEngineTool } from "./ask-ai-engine.js";

// Fix generators
export { generateCitationLiftTool } from "./generate-citation-lift.js";

import { fetchPageTool } from "./fetch-page.js";
import { fetchSitemapTool } from "./fetch-sitemap.js";
import { parsePageTool } from "./parse-page.js";
import { detectTemplatesTool } from "./detect-templates.js";
import { sampleTemplateTool } from "./sample-template.js";
import { checkRuleThinContentTool } from "./check-rule-thin-content.js";
import { checkRuleMissingAuthorTool } from "./check-rule-missing-author.js";
import { checkRuleCanonicalConsistencyTool } from "./check-rule-canonical-consistency.js";
import { checkRuleJsonLdValidTool } from "./check-rule-json-ld-valid.js";
import { checkRuleAnswerFirstTool } from "./check-rule-answer-first.js";
import { checkRuleNearDuplicateTool } from "./check-rule-near-duplicate.js";
import { checkRuleFaqCoverageTool } from "./check-rule-faq-coverage.js";
import { checkRuleCitableFactsTool } from "./check-rule-citable-facts.js";
import { checkRuleFreshnessSignalsTool } from "./check-rule-freshness-signals.js";
import { checkRuleContentModularityTool } from "./check-rule-content-modularity.js";
import { checkRuleSummaryBaitTool } from "./check-rule-summary-bait.js";
import { checkRuleRequiredFieldsTool } from "./check-rule-required-fields.js";
import { checkRuleSchemaConsistencyTool } from "./check-rule-schema-consistency.js";
import { checkDomainLlmsTxtTool } from "./check-domain-llms-txt.js";
import { checkDomainCrawlerAccessTool } from "./check-domain-crawler-access.js";
import { checkRobotsTool } from "./check-robots.js";
import { checkIndexabilityTool } from "./check-indexability.js";
import { validateJsonLdTool } from "./validate-jsonld.js";
import { querySerpTool } from "./query-serp.js";
import { askAiEngineTool } from "./ask-ai-engine.js";
import { generateCitationLiftTool } from "./generate-citation-lift.js";

/**
 * The full orchestrator tool registry, keyed by tool name.
 *
 * To convert into AI-SDK input shape:
 *   const aiTools = Object.fromEntries(
 *     Object.entries(orchestratorTools).map(([k, t]) => [k, t.toAiTool()])
 *   );
 *   streamText({ tools: aiTools, ... });
 */
export const orchestratorTools = {
  // I/O + sampling
  fetch_page: fetchPageTool,
  fetch_sitemap: fetchSitemapTool,
  parse_page: parsePageTool,
  detect_templates: detectTemplatesTool,
  sample_template: sampleTemplateTool,

  // Per-page rule checks
  check_rule_thin_content: checkRuleThinContentTool,
  check_rule_missing_author: checkRuleMissingAuthorTool,
  check_rule_canonical_consistency: checkRuleCanonicalConsistencyTool,
  check_rule_json_ld_valid: checkRuleJsonLdValidTool,
  check_rule_answer_first: checkRuleAnswerFirstTool,

  // Cluster / multi-page rule checks
  check_rule_near_duplicate: checkRuleNearDuplicateTool,
  check_rule_faq_coverage: checkRuleFaqCoverageTool,
  check_rule_citable_facts: checkRuleCitableFactsTool,
  check_rule_freshness_signals: checkRuleFreshnessSignalsTool,
  check_rule_content_modularity: checkRuleContentModularityTool,
  check_rule_summary_bait: checkRuleSummaryBaitTool,
  check_rule_required_fields: checkRuleRequiredFieldsTool,
  check_rule_schema_consistency: checkRuleSchemaConsistencyTool,

  // Domain-level checks
  check_domain_llms_txt: checkDomainLlmsTxtTool,
  check_domain_crawler_access: checkDomainCrawlerAccessTool,

  // Utility checks
  check_robots: checkRobotsTool,
  check_indexability: checkIndexabilityTool,
  validate_jsonld: validateJsonLdTool,

  // External probes
  query_serp: querySerpTool,
  ask_ai_engine: askAiEngineTool,

  // Fix generators
  generate_citation_lift: generateCitationLiftTool,
} as const;

export type OrchestratorToolName = keyof typeof orchestratorTools;
