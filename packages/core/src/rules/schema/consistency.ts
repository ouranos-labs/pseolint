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

  // Within each cluster of ≥2 pages, fire only when pages carry DIFFERENT @type
  // SETS. A single page legitimately emits several JSON-LD blocks (e.g. Article +
  // FAQPage + Organization) — that multi-type set is not an inconsistency. The
  // problem is two pages on the SAME template disagreeing on their type set
  // (e.g. one Article, one NewsArticle). Comparing per-page set signatures (not
  // the union) avoids the false positive where every page shares the same set.
  const setSignature = (types: Set<string>): string => Array.from(types).sort().join("+");
  for (const members of clustersBySignature.values()) {
    if (members.length < 2) {
      continue;
    }

    const distinctSetSignatures = new Set(members.map((m) => setSignature(m.types)));
    if (distinctSetSignatures.size <= 1) {
      continue; // all pages in this template cluster agree on their @type set
    }

    const variants = Array.from(distinctSetSignatures)
      .sort()
      .map((s) => `[${s.split("+").join(", ")}]`)
      .join(" vs ");
    findings.push({
      ruleId: "schema/consistency",
      severity: "info",
      message: `Template pages disagree on schema @type (${variants}). Use a consistent @type across pages that share the same template structure.`,
      relatedUrls: members.map((m) => m.url),
      fix: `Use a consistent @type (or set of @types) across all pages that share the same template structure.`
    });
  }

  return findings;
}
