/**
 * Shape-detection types for audit summaries stored in R2.
 *
 * v0.3 reports (legacy) and v0.4 reports (current) coexist in storage. The
 * `/r/[slug]` renderer must be able to parse and render both. We model both
 * shapes as a discriminated union keyed off the presence of `schemaVersion`.
 *
 * Why this lives here and not in `@pseolint/core`:
 * - `@pseolint/core` only exports the *current* AuditSummary type (v0.4). The
 *   v0.3 shape has been removed from the engine. We keep the legacy shape
 *   defined here so the renderer can decode old R2 blobs without resurrecting
 *   dead engine code.
 */
import type {
  AuditSummary as AuditSummaryV04Core,
  ReadinessReport,
  RuleResult,
  SiteClassification,
  SiteType,
} from "@pseolint/core";

export type { ReadinessReport, RuleResult, SiteClassification, SiteType };

/**
 * Legacy v0.3 summary shape. Mirrors what the engine wrote prior to the v0.4
 * redesign. Field set is intentionally narrow: only what the renderer reads.
 */
export interface AuditSummaryV03 {
  /** Numeric risk score 0–100 (low = good). */
  score: number;
  /** Flat finding array. v0.3 grouped by rule client-side. */
  findings: RuleResult[];
  /** 8-category risk breakdown (e.g. spam, content, links, tech, schema, ...). */
  categoryScores: Record<string, number>;
  /** Origin readiness aggregate. Optional: older runs may lack it. */
  readiness?: ReadinessReport;
  pageCount: number;
  groupScores?: Record<string, number>;
  groupPageCounts?: Record<string, number>;
  templateDetected?: boolean;
  rawFindingCount?: number;
}

/** Current v0.4 summary shape, re-exported from the core package. */
export type AuditSummaryV04 = AuditSummaryV04Core;

/** Union accepted by the renderer. Discriminate on `schemaVersion` presence. */
export type AnyAuditSummary = AuditSummaryV03 | AuditSummaryV04;

/**
 * True when the summary is the current bucketed-issues shape (v0.4 and newer).
 *
 * The `schemaVersion` string carries a version tag that bumps on every public
 * output change (`2026-04-v0.4` → `2026-06-v0.6` → …). Storage holds blobs
 * written by multiple engine versions, so we detect "has a schemaVersion at
 * all" (any dated `YYYY-MM-vX.Y` tag) rather than pinning a single literal:
 * legacy v0.3 blobs have no `schemaVersion` field and fall through to the v0.3
 * branch.
 */
export function isV04Summary(s: AnyAuditSummary): s is AuditSummaryV04 {
  const v = (s as AuditSummaryV04).schemaVersion;
  return typeof v === "string" && /^\d{4}-\d{2}-v\d+\.\d+/.test(v);
}
