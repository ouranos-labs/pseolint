import type { ParsedPage, RuleResult } from "../../types.js";

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function thinContentRule(
  pages: ParsedPage[],
  minWords: number
): { findings: RuleResult[]; thinContentUrls: Set<string> } {
  const findings: RuleResult[] = [];
  const thinContentUrls = new Set<string>();

  for (const page of pages) {
    const words = countWords(page.contentText);
    if (words >= minWords) {
      continue;
    }

    thinContentUrls.add(page.url);
    findings.push({
      ruleId: "spam/thin-content",
      severity: "error",
      message: `${page.url} has thin content (${words} words).`
    });
  }

  return { findings, thinContentUrls };
}
