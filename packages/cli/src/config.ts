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

/**
 * Merge CLI flags over config file over defaults.
 * Currently CLI flags don't map directly to rule options,
 * so this simply returns the config as-is.
 */
export function mergeOptions(
  configFile: AuditOptions,
  _cliFlags: Record<string, unknown>,
): AuditOptions {
  return { ...configFile };
}
