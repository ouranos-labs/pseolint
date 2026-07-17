export * from "./types.js";
export * from "./auditor.js";
export * from "./parser.js";
export * from "./url-normalize.js";
export * from "./algorithms/simhash.js";
export * from "./algorithms/entity-mask.js";
export * from "./algorithms/fact-extraction.js";
export { deriveEntityPatterns } from "./algorithms/auto-entity-mask.js";
export * from "./rules/spam/near-duplicate.js";
export * from "./rules/spam/entity-swap.js";
export * from "./rules/spam/thin-content.js";
export * from "./rules/spam/boilerplate-ratio.js";
export * from "./rules/spam/template-diversity.js";
export * from "./rules/spam/publication-velocity.js";
export * from "./rules/spam/doorway-pattern.js";
export * from "./rules/spam/template-coverage.js";
export * from "./rules/content/unique-value.js";
export * from "./rules/content/meta-uniqueness.js";
export * from "./rules/content/missing-author.js";
export * from "./rules/content/eeat-signals.js";
export * from "./rules/content/citation-coverage.js";
export * from "./rules/content/common-phrase-reuse.js";
export * from "./rules/content/regurgitated-content.js";
export * from "./rules/links/orphan-pages.js";
export * from "./rules/links/dead-ends.js";
export * from "./rules/links/link-depth.js";
export * from "./rules/links/cluster-connectivity.js";
export * from "./rules/tech/canonical-consistency.js";
export * from "./rules/tech/canonical-noindex-conflict.js";
export * from "./rules/tech/robots-noindex-conflict.js";
export * from "./rules/tech/sitemap-completeness.js";
export * from "./rules/tech/redirect-chain.js";
export * from "./rules/tech/soft-404.js";
export * from "./rules/tech/hreflang-consistency.js";
export * from "./rules/schema/json-ld-valid.js";
export * from "./rules/schema/required-fields.js";
export * from "./rules/schema/consistency.js";
export * from "./algorithms/tf-idf.js";
export * from "./rules/cannibal/url-pattern.js";
export * from "./rule-references.js";
export * from "./page-classifier.js";
export * from "./formatters/index.js";
export * from "./renderer.js";
export * from "./enrich-findings.js";
export * from "./data-source-loader.js";
export * from "./rules/data/data-binding.js";
export { llmsTxtRule, validateLlmsTxt } from "./rules/aeo/llms-txt.js";
export { crawlerAccessRule, parseRobotsByUserAgent, isFullyDisallowed, DEFAULT_AI_CRAWLERS } from "./rules/aeo/crawler-access.js";
export { freshnessSignalsRule } from "./rules/aeo/freshness-signals.js";
export { faqCoverageRule } from "./rules/aeo/faq-coverage.js";
export { answerFirstRule, extractFirstParagraph } from "./rules/aeo/answer-first.js";
export { citableFactsRule } from "./rules/aeo/citable-facts.js";
export { contentModularityRule } from "./rules/aeo/content-modularity.js";
export { summaryBaitRule } from "./rules/aeo/summary-bait.js";
export { cachedFetch, cacheKeyFor, clearCache, getCacheSizeInfo, pruneCache, safeFetch, FilesystemCacheBackend, CACHE_ENTRY_SCHEMA_VERSION } from "./cache.js";
export type { CacheConfig, CachedFetchOptions, CachedFetchResult, CacheEntry, CacheSizeInfo, PruneResult, CacheBackend, AnyCacheEntry, RedirectPointerEntry } from "./cache.js";
export type { SafeMode } from "./types.js";
export type { CacheOptions, CacheStats, SamplingStrategy, StateOptions } from "./types.js";
export { stratifiedSample, inferUrlTemplate } from "./stratified-sample.js";
export { readState, writeState, computeContentHash, normalizeHtmlForHash, STATE_SCHEMA_VERSION } from "./state.js";
export type { RunState, UrlStateEntry, RenderMode, Finding } from "./state.js";
export { CORE_RULESET_VERSION } from "./ruleset-version.js";
export { planScrapeStrategy, DEFAULT_AGE_FLOOR_DAYS } from "./scrape-strategy.js";
export type {
  ScrapePlan,
  ScrapeStrategyInputs,
  RefetchReason,
  SkipReason,
  GscDelta,
  GscThresholds,
} from "./scrape-strategy.js";

// AI triage
export type {
  AiOptions,
} from "./types.js";
export type {
  TokenUsage,
  RootCause,
  TriageResult,
} from "./ai/types.js";
export { triageFindings, triage } from "./ai/triage.js";
export type { TriageOptions, TriageOutcome } from "./ai/triage.js";
export { createLanguageModel, detectProvider } from "./ai/adapters/index.js";

// AI orchestrator (single public entry point composing tools + runner +
// manifest validation + diff generation).
export { orchestrate } from "./ai/orchestrate.js";
export type { OrchestrateOptions, OrchestrateResult } from "./ai/orchestrate.js";
export {
  runOrchestrator,
  finishAuditTool,
  manifestSchema,
  buildSystemPrompt,
  DEFAULT_BUDGET,
} from "./ai/orchestrator/index.js";
export type {
  RunOrchestratorOptions,
  FixManifest,
  BudgetCaps,
  UsageSnapshot,
  StopReason,
  SessionEvent,
  SessionResult,
} from "./ai/orchestrator/index.js";
export { orchestratorTools, defineTool } from "./ai/tools/index.js";
export type { OrchestratorToolName } from "./ai/tools/index.js";
export {
  validateManifest,
  diffManifest,
  diffPageChange,
  diffDomainPatch,
} from "./ai/manifest/index.js";
export type {
  ManifestValidationReport,
  PatchValidationFailure,
  ValidationResult,
  PatchDiff,
  ManifestDiff,
} from "./ai/manifest/index.js";
export {
  generateCitationBlock,
  draftToPageChanges,
  faqToHtml,
  faqToJsonLd,
  makeCitationGenerate,
  citationSchema,
} from "./algorithms/citation-lift/index.js";
export type { CitationDraft, CitationInput, CitationGenOpts } from "./algorithms/citation-lift/index.js";
export { renderManifest, applyEditToContent } from "./ai/apply/render-manifest.js";
export type { TemplateMapping, FileEdit, ChecklistItem, RenderedManifest } from "./ai/apply/render-manifest.js";
export type { ProviderId, ResolvedModel } from "./ai/adapters/index.js";
export { PROMPT_VERSION, assignFindingId } from "./ai/prompt.js";
export { estimateCostUsd } from "./ai/cost.js";

export * from "./telemetry/index.js";
export type { TelemetryOptions } from "./types.js";
export { promptTriageFeedback } from "./ai/feedback-prompt.js";
export type { FeedbackRating, PromptOptions } from "./ai/feedback-prompt.js";
export { RULE_SCOPE, isRuleAllowedInDiff, SCORED_RULE_COUNT } from "./rules/scope.js";
export type { RuleScope } from "./rules/scope.js";
export { DEFAULT_ANALYTICS_HOSTS, isAnalyticsRequest } from "./analytics-blocklist.js";
export type { AnalyticsMode } from "./analytics-blocklist.js";
export {
  DnsResolutionError,
  SSRFError,
  decodeNumericIPv4,
  isLocalhostUrl,
  isPrivateIPv4,
  isPrivateIPv6,
  isPrivateOrReservedHost,
  validateTargetHost,
} from "./ssrf-guard.js";
export type { ValidateTargetHostOptions } from "./ssrf-guard.js";
export { SAFE_MODE_PRESETS, resolveSafeModeKey } from "./safe-mode-preset.js";
export type { SafeModePreset, SafeModeKey } from "./safe-mode-preset.js";
export { FetchObserver, computeReadiness, detectDevServer } from "./fetch-observer.js";
export type { DetectedFramework, FetchObservation, ReadinessReport, ReadinessVerdict, ReadinessThresholds } from "./fetch-observer.js";
export { BackpressureMonitor, OriginDegradedError } from "./backpressure.js";
export type { BackpressureOptions, BackpressureDecision, BackpressureSnapshot } from "./backpressure.js";
export { checkOriginHealth } from "./origin-preflight.js";
export type { OriginVerdict, OriginPreflightOptions, OriginPreflightReport, OriginProbeSample } from "./origin-preflight.js";
export {
  classifySite,
  clusterUrlTemplates,
  normalizePathToTemplate,
  PSEO_ONLY_RULE_IDS,
} from "./site-classifier.js";
export type {
  ClassificationSignal,
  ClassifySiteInput,
  SiteClassification,
  SiteType,
} from "./site-classifier.js";
export { CompositeAuthorityProvider } from "./algorithms/authority/provider.js";
export type { AuthorityProvider } from "./algorithms/authority/provider.js";
export { OpenPageRankProvider } from "./algorithms/authority/openpagerank.js";
export { CommonCrawlProvider } from "./algorithms/authority/commoncrawl.js";
