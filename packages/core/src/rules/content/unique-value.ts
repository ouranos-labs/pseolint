import type { ParsedPage, RuleResult } from "../../types.js";

function tokenize(text: string): string[] {
  // Strip leading/trailing punctuation so "word", "word." and "(word)" count as
  // the SAME token. Without this, surrounding punctuation spuriously inflated
  // the "unique" count (a word that's shared but happens to carry a trailing
  // comma on one page looked unique) — false precision in the shared/unique
  // split this rule now surfaces.
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
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
    const distinct = new Set(pageTokens[idx]);
    let uniqueCount = 0;
    let sharedCount = 0;
    for (const token of distinct) {
      if ((frequencies.get(token) ?? 0) === 1) uniqueCount += 1;
      else sharedCount += 1;
    }
    if (uniqueCount < minUniqueWords) {
      const needed = minUniqueWords - uniqueCount;
      findings.push({
        ruleId: "content/unique-value",
        severity: "error",
        // Surface the shared-vs-unique split so the author can see that most of
        // the page's words already appear elsewhere (the "name the overlap"
        // signal) — not just a bare unique-word count.
        message: `${page.url} has only ${uniqueCount} page-unique words (min ${minUniqueWords}); ${sharedCount} of its ${distinct.size} distinct words also appear on other pages.`,
        pageUrl: page.url,
        // Axis-aware guidance: the #1 trap on pSEO sites is adding real, useful,
        // but per-axis-SHARED data (a role's regulations repeated across that
        // role's documents; a state's statutes across its pages) which doesn't
        // count. Spell that out so authors don't burn effort on it.
        fix: `Add ~${needed} more words that appear on NO other page. Content repeated across pages on the same entity axis — boilerplate, shared legal/spec blocks, or per-axis data (e.g. a role's regulations across that role's documents, a state's statutes across its pages) — does NOT count toward uniqueness, even when it's useful. Only page-specific text (a unique lead, this record's distinct facts, page-specific examples) moves this metric.`
      });
    }
  });

  return findings;
}
