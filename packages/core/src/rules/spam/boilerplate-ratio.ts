import type { ParsedPage, RuleResult } from "../../types.js";

function extractTextBlocks(contentText: string): string[] {
  return contentText
    .split(/[.!?]\s+|\n+/)
    .map((block) => block.trim().toLowerCase())
    .filter((block) => block.length > 20);
}

function wordCount(block: string): number {
  return block.split(/\s+/).length;
}

export function boilerplateRatioRule(pages: ParsedPage[], maxRatio: number): RuleResult[] {
  if (pages.length < 2) {
    return [];
  }

  const N = pages.length;
  const pageBlocks = pages.map((page) => extractTextBlocks(page.contentText));

  // Build per-block document frequency (how many pages contain each block).
  const blockFrequency = new Map<string, number>();
  for (const blocks of pageBlocks) {
    const unique = new Set(blocks);
    for (const block of unique) {
      blockFrequency.set(block, (blockFrequency.get(block) ?? 0) + 1);
    }
  }

  // Continuous weight, min-max normalized over document frequency: a block
  // unique to ONE page is not boilerplate at all (weight 0); a block on EVERY
  // page is full boilerplate (weight 1); mid-frequency blocks scale linearly
  // between. (freq-1)/(N-1) (not freq/N) so unique content never inflates the
  // ratio (which freq/N does, giving every block at least 1/N). N>=2 here, so
  // N-1>=1: no division by zero. Removes the binary skeleton cliff entirely.
  const blockWeight = (block: string): number => {
    const freq = blockFrequency.get(block) ?? 0;
    return (freq - 1) / (N - 1);
  };

  const findings: RuleResult[] = [];

  pages.forEach((page, index) => {
    const blocks = pageBlocks[index];
    if (blocks.length === 0) return;

    const totalWords = blocks.reduce((sum, b) => sum + wordCount(b), 0);
    if (totalWords === 0) return;

    // Weighted boilerplate word count: each block contributes (weight * its word count).
    const weightedBoilerplateWords = blocks.reduce((sum, b) => {
      return sum + blockWeight(b) * wordCount(b);
    }, 0);

    const ratio = weightedBoilerplateWords / totalWords;

    if (ratio <= maxRatio) return;

    // 2-band severity: clearly over (≥ threshold + 0.1) → error; just over → warning.
    const clearlyOver = ratio >= maxRatio + 0.1;
    const severity = clearlyOver ? "error" : "warning";
    const confidence = clearlyOver ? "high" : "medium";

    findings.push({
      ruleId: "spam/boilerplate-ratio",
      severity,
      confidence,
      pageUrl: page.url,
      message: `${page.url} has boilerplate ratio ${(ratio * 100).toFixed(1)}% (max ${(maxRatio * 100).toFixed(1)}%).`,
      fix: `${(ratio * 100).toFixed(1)}% of this page's content is shared template text. Reduce repeated boilerplate sections or add unique content blocks (introductions, case studies, or page-specific data) to bring the ratio below ${(maxRatio * 100).toFixed(1)}%.`
    });
  });

  return findings;
}
