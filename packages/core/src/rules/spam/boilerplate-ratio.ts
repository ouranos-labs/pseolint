import type { ParsedPage, RuleResult } from "../../types.js";

function extractTextBlocks(contentText: string): string[] {
  return contentText
    .split(/[.!?]\s+|\n+/)
    .map((block) => block.trim().toLowerCase())
    .filter((block) => block.length > 20);
}

export function boilerplateRatioRule(pages: ParsedPage[], maxRatio: number): RuleResult[] {
  if (pages.length < 2) {
    return [];
  }

  const pageBlocks = pages.map((page) => extractTextBlocks(page.contentText));

  const blockFrequency = new Map<string, number>();
  for (const blocks of pageBlocks) {
    const unique = new Set(blocks);
    for (const block of unique) {
      blockFrequency.set(block, (blockFrequency.get(block) ?? 0) + 1);
    }
  }

  const skeletonCutoff = Math.max(2, Math.floor(pages.length * 0.8) + 1);
  const skeleton = new Set(
    Array.from(blockFrequency.entries())
      .filter(([, count]) => count >= skeletonCutoff)
      .map(([block]) => block)
  );

  if (skeleton.size === 0) {
    return [];
  }

  const findings: RuleResult[] = [];
  pages.forEach((page, index) => {
    const blocks = pageBlocks[index];
    if (blocks.length === 0) {
      return;
    }

    const totalWords = blocks.reduce((sum, b) => sum + b.split(/\s+/).length, 0);
    const boilerplateWords = blocks
      .filter((b) => skeleton.has(b))
      .reduce((sum, b) => sum + b.split(/\s+/).length, 0);

    if (totalWords === 0) return;

    const ratio = boilerplateWords / totalWords;
    if (ratio > maxRatio) {
      findings.push({
        ruleId: "spam/boilerplate-ratio",
        severity: "error",
        message: `${page.url} has boilerplate ratio ${(ratio * 100).toFixed(1)}% (max ${(maxRatio * 100).toFixed(1)}%).`
      });
    }
  });

  return findings;
}
