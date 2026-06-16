import { maskEntities } from "../../algorithms/entity-mask.js";
import { hammingDistance, simHashFromText, similarityFromDistance } from "../../algorithms/simhash.js";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";
import type { PairMatch } from "./near-duplicate.js";

/**
 * Compute masking coverage: fraction of pages where at least one entity token
 * was replaced by a placeholder.  A page "benefited" from masking when its
 * masked text differs from the original.
 *
 * ponytail: threshold is <20% of pages masked → low coverage (weak entity signal).
 * Zero patterns supplied is a degenerate case and always yields low coverage.
 */
function maskingCoverage(pages: ParsedPage[], patterns: EntityMaskPattern[]): number {
  if (patterns.length === 0 || pages.length === 0) return 0;
  let touched = 0;
  for (const page of pages) {
    const masked = maskEntities(page.contentText, patterns);
    if (masked !== page.contentText) touched += 1;
  }
  return touched / pages.length;
}

const LOW_COVERAGE_THRESHOLD = 0.2; // ponytail: <20% pages masked → low-confidence signal

export function entitySwapRule(
  pages: ParsedPage[],
  patterns: EntityMaskPattern[],
  threshold: number
): { findings: RuleResult[]; pairs: PairMatch[] } {
  const findings: RuleResult[] = [];
  const pairs: PairMatch[] = [];
  const hashes = pages.map((page) => simHashFromText(maskEntities(page.contentText, patterns)));

  const coverage = maskingCoverage(pages, patterns);
  const isLowCoverage = coverage < LOW_COVERAGE_THRESHOLD;

  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      const similarity = similarityFromDistance(hammingDistance(hashes[i], hashes[j]));
      if (similarity >= threshold) {
        pairs.push({ leftUrl: pages[i].url, rightUrl: pages[j].url, similarity });

        if (isLowCoverage) {
          // Weak/absent entity patterns mean masking barely changed the text;
          // this finding overlaps a plain near-duplicate signal, not a confirmed
          // entity-swap.  Downgrade to warning with low confidence.
          findings.push({
            ruleId: "spam/entity-swap",
            severity: "warning",
            confidence: "low",
            message:
              `${pages[i].url} and ${pages[j].url} are near-identical, but entity masking ` +
              `coverage is too low to confirm an entity-swap pattern (masking touched ` +
              `${Math.round(coverage * 100)}% of pages). ` +
              `Provide entity patterns or treat this as a near-duplicate finding instead.`,
            pageUrl: pages[i].url,
            relatedUrls: [pages[j].url],
            similarity,
            fix: "Supply entity patterns (city names, states, product names) so the rule can confirm whether these pages are entity-swapped templates. If no entity patterns apply, address as near-duplicate spam instead."
          });
        } else {
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
  }

  return { findings, pairs };
}
