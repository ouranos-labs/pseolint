import type { EntityMaskPattern, ParsedPage } from "../types.js";

export interface DeriveOptions {
  /** Only derive from URL-template clusters with at least this many siblings. */
  minClusterSize?: number; // default 3
  /** Ignore tokens shorter than this. */
  minTokenLength?: number; // default 3
  /** Placeholder substituted for masked entities. */
  placeholder?: string; // default "[ENTITY]"
  /** Enable URL-slug token derivation. */
  urlSlug?: boolean; // default true
  /** Enable capitalized-content-token derivation. */
  contentDiff?: boolean; // default true
  /** Hard cap on total derived tokens (over-masking guard). */
  maxTokens?: number; // default 500
}

type MaskPage = Pick<ParsedPage, "url" | "contentText">;

// STUB — real body implemented in the module task. Signature is stable so the
// auditor wiring can be built in parallel against it.
export function deriveEntityPatterns(_pages: ReadonlyArray<MaskPage>, _opts?: DeriveOptions): EntityMaskPattern[] {
  return [];
}
