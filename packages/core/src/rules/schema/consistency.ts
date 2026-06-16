import type { ParsedPage, RuleResult } from "../../types.js";

export function schemaConsistencyRule(pages: ParsedPage[]): RuleResult[] {
  const findings: RuleResult[] = [];

  // Group pages by structureSignature so we only compare @type within template clusters.
  // A normal site legitimately mixes types across templates (WebSite on home, Article on
  // blog, Product on listings). Variance is only a problem when pages that share the same
  // template (same structureSignature) use different @type values.
  const clustersBySignature = new Map<string, Array<{ url: string; types: Set<string> }>>();

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
    if (types.size === 0) {
      continue;
    }
    const sig = page.structureSignature;
    if (!clustersBySignature.has(sig)) {
      clustersBySignature.set(sig, []);
    }
    clustersBySignature.get(sig)!.push({ url: page.url, types });
  }

  // Within each cluster of ≥2 pages, check whether all pages use the same @type set.
  for (const members of clustersBySignature.values()) {
    if (members.length < 2) {
      continue;
    }

    const allTypesInCluster = new Set<string>();
    for (const { types } of members) {
      for (const t of types) {
        allTypesInCluster.add(t);
      }
    }

    if (allTypesInCluster.size <= 1) {
      continue;
    }

    const typeList = Array.from(allTypesInCluster).sort().join(", ");
    findings.push({
      ruleId: "schema/consistency",
      severity: "info",
      message: `Template pages use mixed schema types (${typeList}). Consider using a consistent @type across template pages.`,
      relatedUrls: members.map((m) => m.url),
      fix: `Use a consistent @type across all pages that share the same template structure.`
    });
  }

  return findings;
}
