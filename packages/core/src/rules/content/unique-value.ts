import type { ParsedPage, RuleResult } from "../../types.js";

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(Boolean);
}

export function uniqueValueRule(pages: ParsedPage[], minUniqueWords: number): RuleResult[] {
  const frequencies = new Map<string, number>();
  const pageTokens = pages.map((page) => tokenize(page.contentText));

  for (const tokens of pageTokens) {
    for (const token of new Set(tokens)) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }

  const findings: RuleResult[] = [];
  pages.forEach((page, idx) => {
    const uniqueCount = new Set(
      pageTokens[idx].filter((token) => (frequencies.get(token) ?? 0) === 1)
    ).size;
    if (uniqueCount < minUniqueWords) {
      findings.push({
        ruleId: "content/unique-value",
        severity: "error",
        message: `${page.url} has only ${uniqueCount} unique words (min ${minUniqueWords}).`,
        pageUrl: page.url,
        fix: `Add ${minUniqueWords - uniqueCount} more words of content not found on any other page.`
      });
    }
  });

  return findings;
}
