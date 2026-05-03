import type { ParsedPage, RuleResult } from "../../types.js";

export function templateDiversityRule(
  pages: ParsedPage[],
  minUniqueRatio: number
): RuleResult[] {
  if (pages.length === 0) {
    return [];
  }

  const unique = new Set(pages.map((page) => page.structureSignature)).size;
  const ratio = unique / pages.length;
  if (ratio >= minUniqueRatio) {
    return [];
  }

  return [
    {
      ruleId: "spam/template-diversity",
      severity: "warning",
      message: `Template diversity ratio is ${ratio.toFixed(2)} (min ${minUniqueRatio.toFixed(2)}).`,
      fix: "Vary the HTML structure across pages. Add conditional sections, different layouts, or page-specific components. Identical-structure corpora are a primary scaled-content-abuse signal that the March 27, 2026 core update reinforced."
    }
  ];
}
