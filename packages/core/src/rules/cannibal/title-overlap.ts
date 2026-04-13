import { maskEntities } from "../../algorithms/entity-mask.js";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function titleOverlapRule(
  pages: ParsedPage[],
  patterns: EntityMaskPattern[],
  threshold: number
): RuleResult[] {
  const findings: RuleResult[] = [];
  const maskedTokens = pages.map((page) => tokenize(maskEntities(page.title, patterns)));

  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      const similarity = jaccardSimilarity(maskedTokens[i], maskedTokens[j]);
      if (similarity > threshold) {
        findings.push({
          ruleId: "cannibal/title-overlap",
          severity: "warning",
          message: `${pages[i].url} and ${pages[j].url} have overlapping titles after entity masking (${(similarity * 100).toFixed(1)}% Jaccard similarity).`,
          pageUrl: pages[i].url,
          relatedUrls: [pages[j].url],
          fix: `Differentiate page titles by including unique, page-specific keywords or angles.`
        });
      }
    }
  }

  return findings;
}
