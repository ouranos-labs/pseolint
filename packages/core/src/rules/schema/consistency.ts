import type { ParsedPage, RuleResult } from "../../types.js";

export function schemaConsistencyRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  const typesByPage = new Map<string, Set<string>>();

  for (const page of pages) {
    const types = new Set<string>();
    for (const entry of page.jsonLd) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }
      const obj = entry as Record<string, unknown>;
      if ("__parseError" in obj && obj.__parseError === true) {
        continue;
      }
      if (typeof obj["@type"] === "string" && obj["@type"].trim() !== "") {
        types.add(obj["@type"]);
      }
    }
    if (types.size > 0) {
      typesByPage.set(page.url, types);
    }
  }

  if (typesByPage.size < 2) {
    return findings;
  }

  const allTypes = new Set<string>();
  for (const types of typesByPage.values()) {
    for (const t of types) {
      allTypes.add(t);
    }
  }

  if (allTypes.size <= 1) {
    return findings;
  }

  const typeList = Array.from(allTypes).sort().join(", ");
  findings.push({
    ruleId: "schema/consistency",
    severity: "info",
    message: `Pages use mixed schema types (${typeList}). Consider using a consistent @type across template pages.`,
    relatedUrls: Array.from(typesByPage.keys()),
    fix: `Use a consistent @type across all template pages, or separate pages into groups with different schema types.`
  });

  return findings;
}
