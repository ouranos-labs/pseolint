import type { ParsedPage, RuleResult } from "../../types.js";

export function publicationVelocityRule(pages: ParsedPage[], maxPerDay: number): RuleResult[] {
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
    if (dayPages.length > maxPerDay) {
      findings.push({
        ruleId: "spam/publication-velocity",
        severity: "warning",
        message: `${dayPages.length} pages share publish date ${day}, exceeding max/day ${maxPerDay}.`
      });
    }
  }

  return findings;
}
