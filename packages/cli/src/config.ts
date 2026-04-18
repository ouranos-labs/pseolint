import { cosmiconfig } from "cosmiconfig";
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
  }).optional(),
  state: z.object({
    path: z.string().optional(),
    since: z.boolean().optional(),
    exitOnRegression: z.boolean().optional(),
  }).optional(),
  samplingStrategy: z.enum(["stratified", "random"]).optional(),
  maxPerTemplate: z.number().optional(),
  ai: z.object({
    enabled: z.boolean().optional(),
    provider: z.enum(["anthropic", "ollama"]).optional(),
    model: z.string().optional(),
    endpoint: z.string().optional(),
    apiKey: z.string().optional(),
    maxInputTokens: z.number().optional(),
    maxOutputTokens: z.number().optional(),
    suggest: z.boolean().optional(),
    cache: z.union([
      z.object({
        ttlMs: z.number().optional(),
        dir: z.string().optional(),
      }),
      z.literal(false),
    ]).optional(),
  }).optional(),
});

export async function loadConfig(): Promise<AuditOptions> {
  const explorer = cosmiconfig("pseolint");
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
  render?: { browserWsEndpoint?: string };
  crawlDiscovery?: boolean;
  cache?: { dir?: string; ttlMs: number };
  samplingStrategy?: "stratified" | "random";
  maxPerTemplate?: number;
  state?: { path?: string; since?: boolean; exitOnRegression?: boolean };
  ai?: {
    enabled?: boolean;
    provider?: "anthropic" | "ollama";
    model?: string;
    endpoint?: string;
    maxInputTokens?: number;
    suggest?: boolean;
    cache?: { ttlMs?: number } | false;
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
  if (cliFlags.state !== undefined) result.state = cliFlags.state;
  if (cliFlags.ai !== undefined) {
    result.ai = { ...result.ai, ...cliFlags.ai };
  }
  return result;
}
