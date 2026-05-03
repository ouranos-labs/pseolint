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

      const dimensions: Array<{ position: number; values: number; samples: string[] }> = [];

      for (let pos = 0; pos < tokenSets.length; pos += 1) {
        if (tokenSets[pos].size > 1) {
          const samples = Array.from(tokenSets[pos]).slice(0, 3);
          dimensions.push({ position: pos, values: tokenSets[pos].size, samples });
        }
      }

      // No template pattern if all tokens vary or no tokens vary
      if (dimensions.length === 0) continue;
      if (dimensions.length === segmentCount) continue;

      const totalCombinations = dimensions.reduce((acc, d) => acc * d.values, 1);
      const coverage = names.length / totalCombinations;
      const coveragePct = (coverage * 100).toFixed(1);

      const dimDesc = dimensions
        .map((d) => {
          const sampleStr = d.samples.join(", ");
          return `${d.values} values (e.g. ${sampleStr})`;
        })
        .join(" x ");

      findings.push({
        ruleId: "spam/template-coverage",
        severity: "info",
        message: `${clusterDir} has ${names.length} pages across ${dimensions.length} dimensions: ${dimDesc}. Coverage: ${names.length} of ${totalCombinations} combinations (${coveragePct}%).`,
        fix: totalCombinations > names.length * 5
          ? "Low coverage suggests an overly broad template matrix. Consider narrowing dimensions to combinations you can differentiate with unique content. Sparse high-dimension matrices are exactly what the March 27, 2026 core update down-weighted on programmatic corpora."
          : "Coverage is reasonable. Ensure each combination provides genuinely unique content.",
        relatedUrls: group.map((p) => p.url).sort()
      });
    }
  }

  return findings;
}
