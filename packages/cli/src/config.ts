import { cosmiconfig } from "cosmiconfig";
import { createJiti } from "jiti";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { AuditOptions } from "@pseolint/core";

const rulesSchema = z
  .object({
    stripUrlQuery: z.boolean().optional(),
    stripWwwHost: z.boolean().optional(),
    nearDuplicateThreshold: z.number().optional(),
    entitySwapThreshold: z.number().optional(),
    thinContentMinWords: z.number().optional(),
    publicationVelocityMaxPerDay: z.number().optional(),
    boilerplateMaxRatio: z.number().optional(),
    templateDiversityMinUniqueRatio: z.number().optional(),
    uniqueValueMinWords: z.number().optional(),
    metaUniquenessMinJaccard: z.number().optional(),
    linkDepthMaxClicks: z.number().optional(),
    hubPagesMinSiblings: z.number().optional(),
    hubPagesMaxSiblings: z.number().optional(),
    titleOverlapThreshold: z.number().optional(),
    keywordCollisionMinShared: z.number().optional(),
    templateCoverageMinPages: z.number().optional(),
  })
  .optional();

const auditOptionsSchema = z.object({
  rules: rulesSchema,
  concurrency: z.number().optional(),
  timeout: z.number().optional(),
  sampleSize: z.number().optional(),
  ignore: z.array(z.string()).optional(),
  pageGroups: z.record(z.string(), z.object({
    match: z.union([z.string(), z.array(z.string())]),
    rules: z.array(z.string()).optional(),
    overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  })).optional(),
  render: z.object({
    browserWsEndpoint: z.string().optional(),
    analyticsMode: z.enum(["block", "allow", "allow-first-party"]).optional(),
    extraBlockedHosts: z.array(z.string()).optional(),
  }).optional(),
  crawlDiscovery: z.boolean().optional(),
  templateGenerated: z.boolean().optional(),
  entityPatterns: z.array(z.object({
    placeholder: z.string(),
    pattern: z.string(),
    flags: z.string().optional(),
  })).optional(),
  cache: z.object({
    dir: z.string().optional(),
    ttlMs: z.number().optional(),
    maxBytes: z.number().optional(),
  }).optional(),
  state: z.object({
    path: z.string().optional(),
    since: z.boolean().optional(),
    exitOnRegression: z.boolean().optional(),
  }).optional(),
  samplingStrategy: z.enum(["stratified", "random"]).optional(),
  maxPerTemplate: z.number().optional(),
  safeMode: z.enum(["saas", "cli", "dev"]).optional(),
  autoDevPreset: z.boolean().optional(),
  backpressure: z.boolean().optional(),
  respectRobotsTxt: z.boolean().optional(),
  respectNoindex: z.boolean().optional(),
  skipDetectedAuth: z.boolean().optional(),
  followRedirects: z.boolean().optional(),
  strict: z.boolean().optional(),
  maxCrawlDiscovered: z.number().optional(),
  guardSsrf: z.boolean().optional(),
  ai: z.object({
    enabled: z.boolean().optional(),
    provider: z.string().optional(),
    model: z.string().optional(),
    endpoint: z.string().optional(),
    apiKey: z.string().optional(),
    maxInputTokens: z.number().optional(),
    maxOutputTokens: z.number().optional(),
    maxCostUsd: z.number().optional(),
    dailyBudgetUsd: z.number().optional(),
    suggest: z.boolean().optional(),
    cache: z.union([
      z.object({
        ttlMs: z.number().optional(),
        dir: z.string().optional(),
      }),
      z.literal(false),
    ]).optional(),
  }).optional(),
  telemetry: z.object({
    enabled: z.boolean().optional(),
    path: z.string().optional(),
    prompt: z.boolean().optional(),
    feedback: z.enum(["helpful", "unhelpful"]).optional(),
  }).optional(),
});

/**
 * Loads `pseolint.config.{ts,mts,js,cjs,mjs,json}` etc. via cosmiconfig.
 *
 * v0.4.1 fix: cosmiconfig 9 ships with a `.ts` loader that depends on the
 * `typescript` package being installed at runtime. The CLI does not (and
 * should not) ship `typescript` as a runtime dependency, so config files
 * authored as `pseolint.config.ts` would fail to load — leaving users to
 * inline `--ignore` patterns. We replace the `.ts`/`.mts` loaders with
 * `jiti`, which transpiles TS at runtime without any peer deps.
 */
export async function loadConfig(): Promise<AuditOptions> {
  // Anchor jiti to the cwd so it resolves the user's tsconfig and node_modules.
  const jiti = createJiti(pathToFileURL(`${process.cwd()}/`).href, {
    interopDefault: true,
  });

  const tsLoader = async (filepath: string): Promise<unknown> => {
    // jiti.import with { default: true } unwraps `export default { ... }`.
    return await jiti.import(filepath, { default: true });
  };

  const explorer = cosmiconfig("pseolint", {
    searchPlaces: [
      "package.json",
      ".pseolintrc",
      ".pseolintrc.json",
      ".pseolintrc.yaml",
      ".pseolintrc.yml",
      ".pseolintrc.js",
      ".pseolintrc.ts",
      ".pseolintrc.mts",
      ".pseolintrc.cjs",
      ".pseolintrc.mjs",
      "pseolint.config.js",
      "pseolint.config.ts",
      "pseolint.config.mts",
      "pseolint.config.cjs",
      "pseolint.config.mjs",
      "pseolint.config.json",
    ],
    loaders: {
      ".ts": tsLoader,
      ".mts": tsLoader,
    },
  });
  const result = await explorer.search();

  if (!result || result.isEmpty) {
    return {};
  }

  const parsed = auditOptionsSchema.parse(result.config);
  return parsed as AuditOptions;
}

export interface CliFlags {
  concurrency?: number;
  timeout?: number;
  sampleSize?: number;
  ignore?: string[];
  render?: {
    browserWsEndpoint?: string;
    analyticsMode?: "block" | "allow" | "allow-first-party";
    extraBlockedHosts?: string[];
  };
  crawlDiscovery?: boolean;
  cache?: { dir?: string; ttlMs: number; maxBytes?: number };
  samplingStrategy?: "stratified" | "random";
  maxPerTemplate?: number;
  safeMode?: "saas" | "cli" | "dev";
  autoDevPreset?: boolean;
  backpressure?: boolean;
  respectRobotsTxt?: boolean;
  respectNoindex?: boolean;
  skipDetectedAuth?: boolean;
  followRedirects?: boolean;
  /** v0.4 §4.11: bypass site-classification rule suppression. */
  strict?: boolean;
  state?: { path?: string; since?: boolean; exitOnRegression?: boolean };
  ai?: {
    enabled?: boolean;
    provider?: string;
    model?: string;
    endpoint?: string;
    maxInputTokens?: number;
    maxCostUsd?: number;
    dailyBudgetUsd?: number;
    suggest?: boolean;
    cache?: { ttlMs?: number } | false;
  };
  telemetry?: {
    enabled?: boolean;
    path?: string;
    prompt?: boolean;
    feedback?: "helpful" | "unhelpful";
  };
}

export function mergeOptions(
  configFile: AuditOptions,
  cliFlags: CliFlags,
): AuditOptions {
  const result = { ...configFile };
  if (cliFlags.concurrency !== undefined) result.concurrency = cliFlags.concurrency;
  if (cliFlags.timeout !== undefined) result.timeout = cliFlags.timeout;
  if (cliFlags.sampleSize !== undefined) result.sampleSize = cliFlags.sampleSize;
  if (cliFlags.ignore !== undefined) result.ignore = cliFlags.ignore;
  if (cliFlags.render !== undefined) result.render = cliFlags.render;
  if (cliFlags.crawlDiscovery !== undefined) result.crawlDiscovery = cliFlags.crawlDiscovery;
  if (cliFlags.cache !== undefined) result.cache = cliFlags.cache;
  if (cliFlags.samplingStrategy !== undefined) result.samplingStrategy = cliFlags.samplingStrategy;
  if (cliFlags.maxPerTemplate !== undefined) result.maxPerTemplate = cliFlags.maxPerTemplate;
  if (cliFlags.safeMode !== undefined) result.safeMode = cliFlags.safeMode;
  if (cliFlags.autoDevPreset !== undefined) result.autoDevPreset = cliFlags.autoDevPreset;
  if (cliFlags.backpressure !== undefined) result.backpressure = cliFlags.backpressure;
  if (cliFlags.respectRobotsTxt !== undefined) result.respectRobotsTxt = cliFlags.respectRobotsTxt;
  if (cliFlags.respectNoindex !== undefined) result.respectNoindex = cliFlags.respectNoindex;
  if (cliFlags.skipDetectedAuth !== undefined) result.skipDetectedAuth = cliFlags.skipDetectedAuth;
  if (cliFlags.followRedirects !== undefined) result.followRedirects = cliFlags.followRedirects;
  if (cliFlags.strict !== undefined) result.strict = cliFlags.strict;
  if (cliFlags.state !== undefined) result.state = cliFlags.state;
  if (cliFlags.ai !== undefined) {
    const merged: NonNullable<AuditOptions["ai"]> = { ...result.ai };
    if (cliFlags.ai.enabled !== undefined) merged.enabled = cliFlags.ai.enabled;
    if (cliFlags.ai.provider !== undefined) merged.provider = cliFlags.ai.provider;
    if (cliFlags.ai.model !== undefined) merged.model = cliFlags.ai.model;
    if (cliFlags.ai.endpoint !== undefined) merged.endpoint = cliFlags.ai.endpoint;
    if (cliFlags.ai.maxInputTokens !== undefined) merged.maxInputTokens = cliFlags.ai.maxInputTokens;
    if (cliFlags.ai.maxCostUsd !== undefined) merged.maxCostUsd = cliFlags.ai.maxCostUsd;
    if (cliFlags.ai.dailyBudgetUsd !== undefined) merged.dailyBudgetUsd = cliFlags.ai.dailyBudgetUsd;
    if (cliFlags.ai.suggest !== undefined) merged.suggest = cliFlags.ai.suggest;
    if (cliFlags.ai.cache !== undefined) {
      if (cliFlags.ai.cache === false) {
        merged.cache = false;
      } else {
        const prior = typeof result.ai?.cache === "object" ? result.ai.cache : undefined;
        merged.cache = {
          ...(prior ?? {}),
          ...(cliFlags.ai.cache.ttlMs !== undefined && { ttlMs: cliFlags.ai.cache.ttlMs }),
        };
      }
    }
    result.ai = merged;
  }
  if (cliFlags.telemetry !== undefined) {
    const merged: NonNullable<AuditOptions["telemetry"]> = { ...result.telemetry };
    if (cliFlags.telemetry.enabled !== undefined) merged.enabled = cliFlags.telemetry.enabled;
    if (cliFlags.telemetry.path !== undefined) merged.path = cliFlags.telemetry.path;
    if (cliFlags.telemetry.prompt !== undefined) merged.prompt = cliFlags.telemetry.prompt;
    if (cliFlags.telemetry.feedback !== undefined) merged.feedback = cliFlags.telemetry.feedback;
    result.telemetry = merged;
  }
  return result;
}
