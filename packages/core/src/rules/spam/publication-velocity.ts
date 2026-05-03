import type { ParsedPage, RuleResult } from "../../types.js";

export function publicationVelocityRule(
  pages: ParsedPage[],
  maxPerDay: number,
  corpusFraction = 0.10,
): RuleResult[] {
  const corpusFloor = corpusFraction > 0 ? Math.ceil(pages.length * corpusFraction) : 0;
  const effectiveMax = Math.max(maxPerDay, corpusFloor);

  const byDay = new Map<string, ParsedPage[]>();
  for (const page of pages) {
    if (!page.publishedDate) {
      continue;
    }
    const day = page.publishedDate.slice(0, 10);
    const group = byDay.get(day) ?? [];
    group.push(page);
    byDay.set(day, group);
  }

  const findings: RuleResult[] = [];
  for (const [day, dayPages] of byDay.entries()) {
    if (dayPages.length > effectiveMax) {
      const reason = effectiveMax === corpusFloor && corpusFloor > maxPerDay
        ? `${dayPages.length} pages share publish date ${day}, exceeding ${(corpusFraction * 100).toFixed(0)}% of the ${pages.length}-page corpus (${effectiveMax}/day).`
        : `${dayPages.length} pages share publish date ${day}, exceeding max/day ${effectiveMax}.`;
      findings.push({
        ruleId: "spam/publication-velocity",
        severity: "warning",
        message: reason,
        fix: "Stagger publication dates across pages to avoid appearing auto-generated. Google's March 27, 2026 core update tightened scaled-content-abuse signals on date-stacked corpora."
      });
    }
  }

  return findings;
}
