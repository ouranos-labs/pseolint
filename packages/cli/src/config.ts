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
  })
  .optional();

const auditOptionsSchema = z.object({
  rules: rulesSchema,
  concurrency: z.number().optional(),
  timeout: z.number().optional(),
  sampleSize: z.number().optional(),
  ignore: z.array(z.string()).optional(),
});

export async function loadConfig(): Promise<AuditOptions> {
  const explorer = cosmiconfig("pseolint");
  const result = await explorer.search();

  if (!result || result.isEmpty) {
    return {};
  }

  const parsed = auditOptionsSchema.parse(result.config);
  return parsed;
}

export interface CliFlags {
  concurrency?: number;
  timeout?: number;
  sampleSize?: number;
  ignore?: string[];
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
  return result;
}
