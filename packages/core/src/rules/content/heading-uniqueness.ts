import { maskEntities } from "../../algorithms/entity-mask.js";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";

function norm(value: string, patterns: EntityMaskPattern[]): string {
  return maskEntities(value.toLowerCase().trim(), patterns);
}

export function headingUniquenessRule(
  pages: ParsedPage[],
  patterns: EntityMaskPattern[]
): RuleResult[] {
  const normalizedPerPage = pages.map((page) => ({
    url: page.url,
    h1: page.headings.h1.map((h) => norm(h, patterns)).join(" | "),
    h2: page.headings.h2.map((h) => norm(h, patterns)).join(" | ")
  }));

  const findings: RuleResult[] = [];
  for (let i = 0; i < normalizedPerPage.length; i += 1) {
    for (let j = i + 1; j < normalizedPerPage.length; j += 1) {
      const left = normalizedPerPage[i];
      const right = normalizedPerPage[j];
      if ((left.h1 && left.h1 === right.h1) || (left.h2 && left.h2 === right.h2)) {
        findings.push({
          ruleId: "content/heading-uniqueness",
          severity: "warning",
          message: `${left.url} and ${right.url} share identical normalized headings.`
        });
      }
    }
  }

  return findings;
}
