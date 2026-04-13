import { maskEntities } from "../../algorithms/entity-mask.js";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";

function norm(value: string, patterns: EntityMaskPattern[]): string {
  return maskEntities(value.toLowerCase().trim(), patterns);
}

export function headingUniquenessRule(
  pages: ParsedPage[],
  patterns: EntityMaskPattern[]
): RuleResult[] {
  const h1Groups = new Map<string, string[]>();
  const h2Groups = new Map<string, string[]>();

  for (const page of pages) {
    const h1Key = page.headings.h1.map((h) => norm(h, patterns)).join(" | ");
    const h2Key = page.headings.h2.map((h) => norm(h, patterns)).join(" | ");
    if (h1Key) {
      const group = h1Groups.get(h1Key) ?? [];
      group.push(page.url);
      h1Groups.set(h1Key, group);
    }
    if (h2Key) {
      const group = h2Groups.get(h2Key) ?? [];
      group.push(page.url);
      h2Groups.set(h2Key, group);
    }
  }

  const findings: RuleResult[] = [];
  const emitted = new Set<string>();

  for (const [heading, urls] of h1Groups) {
    if (urls.length < 2) continue;
    const key = `h1::${heading}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    findings.push({
      ruleId: "content/heading-uniqueness",
      severity: "warning",
      message: `${urls.length} pages share identical normalized H1 heading.`,
      relatedUrls: urls.sort(),
      fix: "Write unique headings for each page that reflect its specific content."
    });
  }

  for (const [heading, urls] of h2Groups) {
    if (urls.length < 2) continue;
    const key = `h2::${heading}`;
    if (emitted.has(key)) continue;
    emitted.add(key);
    findings.push({
      ruleId: "content/heading-uniqueness",
      severity: "warning",
      message: `${urls.length} pages share identical normalized H2 headings.`,
      relatedUrls: urls.sort(),
      fix: "Write unique headings for each page that reflect its specific content."
    });
  }

  return findings;
}
