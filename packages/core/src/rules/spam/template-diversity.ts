import type { Confidence, ParsedPage, RuleResult } from "../../types.js";

/**
 * Coarsen a structureSignature ("tag:count|tag:count|...") by bucketing each
 * tag's count logarithmically. Pages that differ only by trivial chrome: one
 * extra ad `<div>`, a conditional nav item: collapse to the SAME coarse
 * signature, so a genuinely single-template site is no longer read as "diverse"
 * from count noise (the false negative the exact-count fingerprint caused).
 *
 * The raw exact-count signature (parser.buildStructureSignature) is SHARED with
 * spam/near-duplicate and spam/doorway-pattern and is deliberately left
 * untouched: this coarsening is local to the diversity measure.
 */
function coarsenSignature(signature: string): string {
  if (!signature) return signature;
  return signature
    .split("|")
    .map((pair) => {
      const idx = pair.lastIndexOf(":");
      if (idx < 0) return pair;
      const tag = pair.slice(0, idx);
      const count = Number(pair.slice(idx + 1));
      if (!Number.isFinite(count)) return pair;
      // log2 bucket: 1→1, 2-3→1, 4-7→2 … 32-63→5, 64-127→6. Trivial count
      // differences land in the same bucket; an order-of-magnitude change does not.
      return `${tag}:${Math.floor(Math.log2(count + 1))}`;
    })
    .join("|");
}

export function templateDiversityRule(
  pages: ParsedPage[],
  minUniqueRatio: number
): RuleResult[] {
  if (pages.length === 0) {
    return [];
  }

  const unique = new Set(pages.map((page) => coarsenSignature(page.structureSignature))).size;
  const ratio = unique / pages.length;
  if (ratio >= minUniqueRatio) {
    return [];
  }

  // Confidence band: a ratio far below the floor is a stronger single-template
  // signal than one hovering just under it.
  const confidence: Confidence = ratio < minUniqueRatio / 2 ? "high" : "medium";

  return [
    {
      ruleId: "spam/template-diversity",
      severity: "warning",
      confidence,
      message:
        `Template diversity ratio is ${ratio.toFixed(2)} (min ${minUniqueRatio.toFixed(2)}); ` +
        `the ${pages.length} pages collapse to ${unique} distinct structural shapes after ignoring minor chrome variation.`,
      fix: "Vary the HTML structure across pages. Add conditional sections, different layouts, or page-specific components. Identical-structure corpora are a primary scaled-content-abuse signal that the March 27, 2026 core update reinforced."
    }
  ];
}
