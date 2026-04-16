import { maskEntities } from "../../algorithms/entity-mask.js";
import { hammingDistance, simHashFromText, similarityFromDistance } from "../../algorithms/simhash.js";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";
import type { PairMatch } from "./near-duplicate.js";

export function entitySwapRule(
  pages: ParsedPage[],
  patterns: EntityMaskPattern[],
  threshold: number
): { findings: RuleResult[]; pairs: PairMatch[] } {
  const findings: RuleResult[] = [];
  const pairs: PairMatch[] = [];
  const hashes = pages.map((page) => simHashFromText(maskEntities(page.contentText, patterns)));

  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      const similarity = similarityFromDistance(hammingDistance(hashes[i], hashes[j]));
      if (similarity >= threshold) {
        pairs.push({ leftUrl: pages[i].url, rightUrl: pages[j].url, similarity });
        findings.push({
          ruleId: "spam/entity-swap",
          severity: "critical",
          message: `${pages[i].url} and ${pages[j].url} look structurally identical after entity masking.`,
          pageUrl: pages[i].url,
          relatedUrls: [pages[j].url],
          similarity,
          fix: "These pages are identical after masking entity names. Add entity-specific content: local regulations, statistics, fees, or requirements unique to each entity."
        });
      }
    }
  }

  return { findings, pairs };
}
