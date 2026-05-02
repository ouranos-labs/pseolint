export { VALID, fail } from "./types.js";
export type { ValidationOk, ValidationErr, ValidationResult } from "./types.js";

export {
  validateAddJsonLd,
  validateReplaceH1,
  validateRewriteMeta,
  validateAddFaqBlock,
  validateRewriteIntro,
  validateAddInternalLink,
  validateRemoveThinBlock,
  validatePageChange,
} from "./page-changes.js";

export {
  validateRobotsTxt,
  validateSitemapXml,
  validateCanonicalStrategy,
  validateDomainPatch,
} from "./domain-patches.js";
