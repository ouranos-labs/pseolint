import { buildCorpus, extractKeywords } from "../../algorithms/tf-idf.js";
import type { ParsedPage, RuleResult } from "../../types.js";

export function keywordCollisionRule(
  pages: ParsedPage[],
  minShared: number = 6
): RuleResult[] {
  const findings: RuleResult[] = [];
  const corpus = buildCorpus(pages.map((page) => page.contentText));
  const keywordsPerPage = pages.map((page) => extractKeywords(page.contentText, corpus, 10));

  for (let i = 0; i < pages.length; i += 1) {
    for (let j = i + 1; j < pages.length; j += 1) {
      const setA = new Set(keywordsPerPage[i]);
      const shared = keywordsPerPage[j].filter((kw) => setA.has(kw));
      if (shared.length >= minShared) {
        findings.push({
          ruleId: "cannibal/keyword-collision",
          severity: "warning",
          message: `${pages[i].url} and ${pages[j].url} share ${shared.length} of their top 10 keywords: ${shared.join(", ")}.`,
          pageUrl: pages[i].url,
          relatedUrls: [pages[j].url]
        });
      }
    }
  }

  return findings;
}
