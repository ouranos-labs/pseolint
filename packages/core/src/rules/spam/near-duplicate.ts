import { hammingDistance, simHashFromText, similarityFromDistance } from "../../algorithms/simhash.js";
import type { ParsedPage, RuleResult } from "../../types.js";

export interface PairMatch {
  leftUrl: string;
  rightUrl: string;
  similarity: number;
}

export function nearDuplicateRule(
  pages: ParsedPage[],
  threshold: number
): { findings: RuleResult[]; pairs: PairMatch[] } {
  const findings: RuleResult[] = [];
  const pairs: PairMatch[] = [];
  const hashes = pages.map((page) => simHashFromText(page.contentText));

  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      const similarity = similarityFromDistance(hammingDistance(hashes[i], hashes[j]));
      if (similarity >= threshold) {
        pairs.push({ leftUrl: pages[i].url, rightUrl: pages[j].url, similarity });
        findings.push({
          ruleId: "spam/near-duplicate",
          severity: "critical",
          message: `${pages[i].url} and ${pages[j].url} are near-duplicates (${(similarity * 100).toFixed(1)}% similar).`
        });
      }
    }
  }

  return { findings, pairs };
}
