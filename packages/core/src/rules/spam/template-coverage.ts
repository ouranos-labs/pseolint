import { maskEntities } from "../../algorithms/entity-mask.js";
import { clusterKeyForUrl } from "../links/cluster-key.js";
import type { EntityMaskPattern, ParsedPage, RuleResult } from "../../types.js";

function extractFilename(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.replace(/\\/g, "/");
  }
  const stripped = path.replace(/\/+$/, "").replace(/\.[^.]+$/, "");
  const lastSlash = stripped.lastIndexOf("/");
  return lastSlash >= 0 ? stripped.slice(lastSlash + 1) : stripped;
}

export function templateCoverageRule(
  pages: ParsedPage[],
  entityPatterns: EntityMaskPattern[],
  minPages: number
): RuleResult[] {
  const byCluster = new Map<string, ParsedPage[]>();
  for (const p of pages) {
    const key = clusterKeyForUrl(p.url);
    const list = byCluster.get(key) ?? [];
    list.push(p);
    byCluster.set(key, list);
  }

  const findings: RuleResult[] = [];

  for (const [clusterDir, group] of byCluster) {
    if (group.length < minPages) continue;

    const maskedFilenames = group.map((p) => {
      const filename = extractFilename(p.url);
      return maskEntities(filename, entityPatterns);
    });

    // Group by segment count (different segment counts = different template patterns)
    const bySegmentCount = new Map<number, string[]>();
    for (const name of maskedFilenames) {
      const tokens = name.split("-").filter(Boolean);
      const count = tokens.length;
      const list = bySegmentCount.get(count) ?? [];
      list.push(name);
      bySegmentCount.set(count, list);
    }

    for (const [, names] of bySegmentCount) {
      if (names.length < 2) continue;

      const segmentCount = names[0].split("-").filter(Boolean).length;
      if (segmentCount === 0) continue;

      const tokenSets: Set<string>[] = Array.from({ length: segmentCount }, () => new Set());

      for (const name of names) {
        const tokens = name.split("-").filter(Boolean);
        for (let pos = 0; pos < tokens.length && pos < segmentCount; pos += 1) {
          tokenSets[pos].add(tokens[pos]);
        }
      }

      const dimensions: Array<{ position: number; values: number }> = [];

      for (let pos = 0; pos < tokenSets.length; pos += 1) {
        if (tokenSets[pos].size > 1) {
          dimensions.push({ position: pos, values: tokenSets[pos].size });
        }
      }

      // No template pattern if all tokens vary or no tokens vary
      if (dimensions.length === 0) continue;
      if (dimensions.length === segmentCount) continue; // Every position varies = no constants = not a template

      const totalCombinations = dimensions.reduce((acc, d) => acc * d.values, 1);
      const coverage = names.length / totalCombinations;
      const coveragePct = (coverage * 100).toFixed(1);

      const dimDesc = dimensions
        .map((d) => `position ${d.position + 1}: ${d.values} values`)
        .join(", ");

      findings.push({
        ruleId: "spam/template-coverage",
        severity: "info",
        message: `${clusterDir} has ${names.length} pages with ${dimensions.length} template dimensions (${dimDesc}). Coverage: ${names.length} of ${totalCombinations} possible combinations (${coveragePct}%).`,
        fix: totalCombinations > names.length * 5
          ? "Low coverage suggests an overly broad template matrix. Consider narrowing dimensions to combinations you can differentiate with unique content."
          : "Coverage is reasonable. Ensure each combination provides genuinely unique content.",
        relatedUrls: group.map((p) => p.url).sort()
      });
    }
  }

  return findings;
}
