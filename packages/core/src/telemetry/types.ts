import crypto from "node:crypto";
import { z } from "zod";

/**
 * Used to correlate a triage-feedback record back to the audit it belongs to.
 * 16 lowercase hex chars = 64 bits of entropy.
 */
export const runIdSchema = z.string().regex(/^[0-9a-f]{16}$/);

export const tokenUsageSchema = z
  .object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  })
  .strict();

export const cacheStatsSchema = z
  .object({
    hits: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    bytesSavedEstimate: z.number().int().nonnegative(),
  })
  .strict();

export const triageTelemetrySchema = z
  .object({
    rootCauseCount: z.number().int().nonnegative(),
    providerId: z.enum(["anthropic", "ollama"]),
    modelId: z.string(),
    cacheHit: z.boolean(),
    tokenUsage: tokenUsageSchema,
    estimatedCostUsd: z.number().optional(),
    truncatedInput: z.boolean(),
  })
  .strict();

/** Audit run record — one per audit. */
export const auditRecordSchema = z
  .object({
    type: z.literal("audit"),
    schemaVersion: z.literal(1),
    runId: runIdSchema,
    timestamp: z.string(), // ISO 8601
    durationMs: z.number().int().nonnegative(),
    score: z.number(),
    pageCount: z.number().int().nonnegative(),
    findingCount: z.number().int().nonnegative(),
    rawFindingCount: z.number().int().nonnegative().optional(),
    templateDetected: z.boolean().optional(),
    cacheStats: cacheStatsSchema.optional(),
    triage: triageTelemetrySchema.optional(),
  })
  .strict();

/** Feedback record — one per triage feedback event. */
export const feedbackRecordSchema = z
  .object({
    type: z.literal("feedback"),
    schemaVersion: z.literal(1),
    runId: runIdSchema,
    timestamp: z.string(),
    rating: z.enum(["helpful", "unhelpful", "skipped"]),
  })
  .strict();

export const telemetryRecordSchema = z.discriminatedUnion("type", [
  auditRecordSchema,
  feedbackRecordSchema,
]);

export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type CacheStatsRecord = z.infer<typeof cacheStatsSchema>;
export type TriageTelemetry = z.infer<typeof triageTelemetrySchema>;
export type AuditRecord = z.infer<typeof auditRecordSchema>;
export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;
export type TelemetryRecord = z.infer<typeof telemetryRecordSchema>;

/**
 * Generate a 16-char lowercase hex runId. Used to correlate an audit record
 * with any later feedback records for the same run.
 */
export function generateRunId(): string {
  return crypto.randomBytes(8).toString("hex");
}
