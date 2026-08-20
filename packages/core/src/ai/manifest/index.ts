/**
 * Manifest validation layer. Patches proposed by the LLM via `finish_audit`
 * pass through these validators before the manifest is persisted to R2.
 * Failures are not silently dropped: the caller (web app's session
 * finalization) decides whether to retry the LLM, drop the failed patches,
 * or surface them as a "needs human review" subset.
 *
 * Phase 4 batch 1 = validators only. Diff generation + ZIP bundle export
 * land in batch 2.
 */
export {
  validateAddJsonLd,
  validateReplaceH1,
  validateRewriteMeta,
  validateAddFaqBlock,
  validateRewriteIntro,
  validateAddInternalLink,
  validateRemoveThinBlock,
  validatePageChange,
  validateRobotsTxt,
  validateSitemapXml,
  validateCanonicalStrategy,
  validateDomainPatch,
} from "./validators/index.js";
export type { ValidationOk, ValidationErr, ValidationResult } from "./validators/index.js";
export { VALID, fail } from "./validators/index.js";
export {
  validateManifest,
} from "./validate-manifest.js";
export type {
  ManifestValidationReport,
  PatchValidationFailure,
} from "./validate-manifest.js";

export {
  diffPageChange,
  diffDomainPatch,
  diffManifest,
} from "./diff.js";
export type { PatchDiff, ManifestDiff } from "./diff.js";
