import { z } from "zod";
import type { AuditOptions } from "@pseolint/core";

/**
 * Allowlisted subset of `AuditOptions` a Pro user is permitted to configure
 * per monitored domain. This is a SECURITY BOUNDARY, not a convenience parser.
 *
 * It MUST never become a raw `AuditOptions` passthrough: only the seven fields
 * below are accepted. Everything a Pro user could use to disable safety:
 * `safeMode`, `guardSsrf`, `respectRobotsTxt`, `respectNoindex`,
 * `skipDetectedAuth`, `maxFetchBytes`, `maxCrawlDiscovered`, `cache`, `render`,
 * `ai`, `contentEffort`, `authorityScore`, `openPageRankApiKey`, `dataSource`,
 * `state`, `force`, `signal`, …: is intentionally absent.
 *
 * `.strict()` rejects any unknown key, so a future `AuditOptions` field that
 * happens to be dangerous cannot leak in just because it was added upstream.
 * This is guard #1. Guard #2 lives in `run-audit.ts`: the validated object is
 * spread FIRST into the `auditSource` opts, with every fixed safety option
 * spread AFTER it, so the safety options win even if validation were bypassed.
 *
 * Shapes are aligned to `@pseolint/core`'s `AuditOptions` /
 * `PageGroupConfig` / `entityPatterns` definitions (see
 * packages/core/src/types.ts). `entityPatterns` uses raw `pattern` + `flags`
 * STRINGS here (not a compiled `RegExp`) because this crosses a JSON boundary;
 * core accepts exactly that shape.
 */
export const scanOptionsSchema = z
  .object({
    crawlDiscovery: z.boolean().optional(),
    fillBudgetViaLinkDiscovery: z.boolean().optional(),
    samplingStrategy: z.enum(["stratified", "random"]).optional(),
    maxPerTemplate: z.number().int().min(1).optional(),
    strict: z.boolean().optional(),
    pageGroups: z
      .record(
        z.string(),
        z.object({
          match: z.union([z.string(), z.array(z.string())]),
          rules: z.array(z.string()).optional(),
          overrides: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
        }),
      )
      .optional(),
    entityPatterns: z
      .array(
        z.object({
          placeholder: z.string(),
          pattern: z.string(),
          flags: z.string().optional(),
        }),
      )
      .optional(),
  })
  .strict();

export type ScanOptions = z.infer<typeof scanOptionsSchema>;

/**
 * The slice of `AuditOptions` that `ScanOptions` is allowed to set. A
 * compile-time check that every key in `ScanOptions` exists on `AuditOptions`
 * with a compatible type: if core ever renames/retypes one of these fields,
 * this fails to typecheck instead of silently drifting.
 */
type _ScanOptionsAreAuditOptions = ScanOptions extends Pick<AuditOptions, keyof ScanOptions>
  ? true
  : never;
const _scanOptionsTypecheck: _ScanOptionsAreAuditOptions = true;
void _scanOptionsTypecheck;

/**
 * Parse a stored/submitted scan-options blob against the allowlist. Returns the
 * validated object on success, or `null` for invalid input, an empty object, or
 * anything that isn't a plain object. Never throws: callers treat `null` as
 * "no per-domain scan options" and fall back to engine defaults.
 */
export function parseScanOptions(raw: unknown): ScanOptions | null {
  const parsed = scanOptionsSchema.safeParse(raw);
  if (!parsed.success) return null;
  // Strip undefined keys so an all-optional object with nothing set is treated
  // as "no options" rather than spreading a bag of `undefined`s downstream.
  const out = parsed.data;
  if (Object.values(out).every((v) => v === undefined)) return null;
  return out;
}
