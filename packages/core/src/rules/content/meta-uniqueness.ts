import { maskEntities } from "../../algorithms/entity-mask.js";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";

export function metaUniquenessRule(
  pages: ParsedPage[],
  patterns: EntityMaskPattern[],
  _minJaccardForCollision: number
): RuleResult[] {
  const groups = new Map<string, string[]>();

  for (const page of pages) {
    if (!page.metaDescription) continue;
    const masked = maskEntities(page.metaDescription, patterns).toLowerCase().trim();
    if (!masked) continue;
    const group = groups.get(masked) ?? [];
    group.push(page.url);
    groups.set(masked, group);
  }

  const findings: RuleResult[] = [];

  for (const [, urls] of groups) {
    if (urls.length < 2) continue;
    findings.push({
      ruleId: "content/meta-uniqueness",
      severity: "error",
      message: `${urls.length} pages share the same meta description template after entity masking.`,
      relatedUrls: urls.sort(),
      fix: "Write a unique meta description for each page that highlights what makes it specifically different."
    });
  }

  return findings;
}
