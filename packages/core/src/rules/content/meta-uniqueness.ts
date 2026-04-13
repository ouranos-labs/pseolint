import { maskEntities } from "../../algorithms/entity-mask.js";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";

function tokens(input: string): Set<string> {
  return new Set(
    input
      .toLowerCase()
      .split(/\s+/)
      .map((v) => v.trim())
      .filter(Boolean)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = Array.from(a).filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size || 1;
  return inter / union;
}

export function metaUniquenessRule(
  pages: ParsedPage[],
  patterns: EntityMaskPattern[],
  minJaccardForCollision: number
): RuleResult[] {
  const findings: RuleResult[] = [];

  for (let i = 0; i < pages.length; i += 1) {
    const left = pages[i];
    const leftMeta = maskEntities(left.metaDescription, patterns);
    const leftTokens = tokens(leftMeta);
    for (let j = i + 1; j < pages.length; j += 1) {
      const right = pages[j];
      const rightMeta = maskEntities(right.metaDescription, patterns);
      const similarity = jaccard(leftTokens, tokens(rightMeta));
      if (similarity >= minJaccardForCollision) {
        findings.push({
          ruleId: "content/meta-uniqueness",
          severity: "error",
          message: `${left.url} and ${right.url} have highly similar normalized meta descriptions (${(similarity * 100).toFixed(1)}%).`
        });
      }
    }
  }

  return findings;
}
