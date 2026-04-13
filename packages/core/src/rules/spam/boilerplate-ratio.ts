import type { ParsedPage, RuleResult } from "../../types.js";

function words(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

export function boilerplateRatioRule(pages: ParsedPage[], maxRatio: number): RuleResult[] {
  if (pages.length < 2) {
    return [];
  }

  const pageWords = pages.map((page) => words(page.contentText));
  const frequencies = new Map<string, number>();
  for (const tokens of pageWords) {
    for (const token of new Set(tokens)) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }

  const skeletonCutoff = Math.max(2, Math.floor(pages.length * 0.8) + 1);
  const skeleton = new Set(
    Array.from(frequencies.entries())
      .filter(([, count]) => count >= skeletonCutoff)
      .map(([token]) => token)
  );

  const findings: RuleResult[] = [];
  pages.forEach((page, index) => {
    const tokens = pageWords[index];
    if (tokens.length === 0) {
      return;
    }

    const boilerplateWords = tokens.filter((token) => skeleton.has(token)).length;
    const ratio = boilerplateWords / tokens.length;
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
